package com.tonihk00.clearplay.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.tonihk00.clearplay.data.api.ServerConfig
import com.tonihk00.clearplay.data.api.SubsonicClient
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("clearplay")

/** Saved servers and which one is active. Stored as JSON in DataStore. */
class ServerStore(private val context: Context) {
    private val serversKey = stringPreferencesKey("servers")
    private val activeKey = stringPreferencesKey("active")
    private val localKey = androidx.datastore.preferences.core.booleanPreferencesKey("local_mode")

    /** "Use music on this phone": signed in without a server. */
    val localMode: Flow<Boolean> = context.dataStore.data.map { it[localKey] ?: false }

    private val lastUrlKey = stringPreferencesKey("last_url")

    /** The last server used; finds cached covers of older downloads that don't record it. */
    val lastUrl: Flow<String?> = context.dataStore.data.map { it[lastUrlKey] }

    suspend fun rememberUrl(url: String) {
        context.dataStore.edit { if (it[lastUrlKey] != url) it[lastUrlKey] = url }
    }

    suspend fun setLocalMode(on: Boolean) {
        context.dataStore.edit { it[localKey] = on }
    }

    val servers: Flow<List<ServerConfig>> = context.dataStore.data.map { p ->
        p[serversKey]?.let { runCatching { SubsonicClient.json.decodeFromString<List<ServerConfig>>(it) }.getOrNull() }
            ?: emptyList()
    }

    val active: Flow<ServerConfig?> = context.dataStore.data.map { p ->
        val list = p[serversKey]?.let {
            runCatching { SubsonicClient.json.decodeFromString<List<ServerConfig>>(it) }.getOrNull()
        }.orEmpty()
        list.firstOrNull { key(it) == p[activeKey] } ?: list.firstOrNull()
    }

    suspend fun saveAndActivate(server: ServerConfig) {
        context.dataStore.edit { p ->
            val list = p[serversKey]?.let {
                runCatching { SubsonicClient.json.decodeFromString<List<ServerConfig>>(it) }.getOrNull()
            }.orEmpty().filterNot { key(it) == key(server) } + server
            p[serversKey] = SubsonicClient.json.encodeToString(list)
            p[activeKey] = key(server)
            p[localKey] = false
            p[lastUrlKey] = server.baseUrl
        }
    }

    suspend fun remove(server: ServerConfig) {
        context.dataStore.edit { p ->
            val list = p[serversKey]?.let {
                runCatching { SubsonicClient.json.decodeFromString<List<ServerConfig>>(it) }.getOrNull()
            }.orEmpty().filterNot { key(it) == key(server) }
            p[serversKey] = SubsonicClient.json.encodeToString(list)
            if (p[activeKey] == key(server)) p.remove(activeKey)
        }
    }

    private fun key(s: ServerConfig) = "${s.user}@${s.baseUrl}"
}
