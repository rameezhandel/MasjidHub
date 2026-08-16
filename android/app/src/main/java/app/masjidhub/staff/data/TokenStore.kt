package app.masjidhub.staff.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Tokens are credentials, so they are encrypted with an AES key that lives in
 * the Android Keystore and never leaves it; only the ciphertext is written to
 * shared preferences. Backups and device transfer are switched off for the app
 * (see res/xml/data_extraction_rules.xml), so the ciphertext stays on device.
 */
class TokenStore(context: Context) {

    private val prefs = context.applicationContext
        .getSharedPreferences("masjidhub.tokens", Context.MODE_PRIVATE)

    val accessToken: String? get() = read(KEY_ACCESS)
    val refreshToken: String? get() = read(KEY_REFRESH)
    val isSignedIn: Boolean get() = accessToken != null

    fun save(tokens: AuthTokens) {
        write(KEY_ACCESS, tokens.accessToken)
        write(KEY_REFRESH, tokens.refreshToken)
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    // Encryption

    private fun write(key: String, value: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        // The IV is generated per encryption and is not secret, so it is stored
        // alongside the ciphertext.
        val payload = cipher.iv + encrypted
        prefs.edit().putString(key, Base64.encodeToString(payload, Base64.NO_WRAP)).apply()
    }

    private fun read(key: String): String? {
        val stored = prefs.getString(key, null) ?: return null
        return try {
            val payload = Base64.decode(stored, Base64.NO_WRAP)
            val iv = payload.copyOfRange(0, IV_LENGTH)
            val encrypted = payload.copyOfRange(IV_LENGTH, payload.size)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, iv))
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        } catch (_: Exception) {
            // The key is gone (app data cleared, or the user changed their lock
            // screen on some devices). Treat it as signed out rather than crash.
            prefs.edit().remove(key).apply()
            null
        }
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "masjidhub.tokens"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val KEY_ACCESS = "accessToken"
        const val KEY_REFRESH = "refreshToken"
        const val IV_LENGTH = 12
        const val TAG_BITS = 128
    }
}
