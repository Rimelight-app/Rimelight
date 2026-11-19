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

    init {
        runCatching {
            cm?.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { recheck() }
                override fun onLost(network: Network) { recheck() }
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) { recheck() }
            })
        }
        recheck()
    }

    private fun hasNetwork(): Boolean {
        val caps = cm?.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /** Pings the server now; called on network changes and after a failed request. */
    fun recheck() {
        check?.cancel()
        check = scope.launch {
            val c = client()
            val ok = when {
                c == null -> false
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
}
