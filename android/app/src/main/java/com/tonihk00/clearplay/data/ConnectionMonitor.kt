package com.tonihk00.clearplay.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import com.tonihk00.clearplay.data.api.SubsonicClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Whether the server answers. Checked at start, whenever the network changes and every
 * 20 s while offline, so the app falls back to downloads and returns by itself.
 */
class ConnectionMonitor(context: Context, private val scope: CoroutineScope, private val client: () -> SubsonicClient?) {
    private val cm = context.getSystemService(ConnectivityManager::class.java)
    private val _online = MutableStateFlow(hasNetwork())
    val online: StateFlow<Boolean> = _online
    private var retry: Job? = null
    private var check: Job? = null
    /** What reachability depends on, as last seen (see [NetKey]). */
    private var lastKey: NetKey? = null

    init {
        runCatching {
            cm?.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { lastKey = null; recheck() }
                override fun onLost(network: Network) { lastKey = null; recheck() }
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    // Signal strength and bandwidth estimates change every few seconds (on the
                    // emulator: 20 pings a minute with the app idle). Only a change that can
                    // matter for reaching the server asks again.
                    val key = NetKey.of(network.toString(), caps)
                    if (shouldRecheck(lastKey, key)) {
                        lastKey = key
                        recheck()
                    }
                }
            })
        }
        recheck()
    }

    /** The parts of a network that decide whether the server can be reached. */
    data class NetKey(val network: String, val internet: Boolean, val validated: Boolean, val transports: Set<Int>) {
        companion object {
            private val TRANSPORTS = listOf(
                NetworkCapabilities.TRANSPORT_WIFI, NetworkCapabilities.TRANSPORT_CELLULAR,
                NetworkCapabilities.TRANSPORT_ETHERNET, NetworkCapabilities.TRANSPORT_VPN,
            )

            fun of(network: String, caps: NetworkCapabilities) = NetKey(
                network,
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
                TRANSPORTS.filter(caps::hasTransport).toSet(),
            )
        }
    }

    private fun hasNetwork(): Boolean {
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** Pings the server now; called on network changes and after a failed request. */
    fun recheck() {
        check?.cancel()
        check = scope.launch {
            // No server yet (the saved login is still being read at start, or signed out): there
            // is nothing to reach, so "online" stays as it was. Reporting offline here made the
            // first real check look like coming back online, and every cold start downloaded
            // the whole library again for Statistics (ClearPlayApp's reconnect refresh).
            val c = client() ?: return@launch
            val ok = when {
                !hasNetwork() -> false
                else -> withTimeoutOrNull(5_000) { runCatching { c.ping() }.isSuccess } ?: false
            }
            _online.value = ok
            retry?.cancel()
            if (!ok && c != null) {
                retry = scope.launch {
                    while (isActive && !_online.value) {
                        delay(20_000)
                        // The current server each time (the account may have changed).
                        val now = client() ?: break
                        val back = hasNetwork() && (withTimeoutOrNull(5_000) { runCatching { now.ping() }.isSuccess } ?: false)
                        if (back) _online.value = true
                    }
                }
            }
        }
    }

    companion object {
        /** A capabilities callback asks the server again only when something that matters changed. */
        fun shouldRecheck(previous: NetKey?, next: NetKey) = previous != next
    }
}
