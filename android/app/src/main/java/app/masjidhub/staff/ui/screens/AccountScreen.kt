package app.masjidhub.staff.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.masjidhub.staff.data.ChangePasswordRequest
import app.masjidhub.staff.data.UpdateProfileRequest
import app.masjidhub.staff.data.User
import app.masjidhub.staff.ui.SessionViewModel
import app.masjidhub.staff.ui.components.DetailRow
import app.masjidhub.staff.ui.components.ScreenScroll
import app.masjidhub.staff.ui.components.SectionCard
import app.masjidhub.staff.util.Format
import kotlinx.coroutines.launch

@Composable
fun AccountScreen(session: SessionViewModel) {
    var editingProfile by remember { mutableStateOf(false) }
    var changingPassword by remember { mutableStateOf(false) }
    var confirmingSignOut by remember { mutableStateOf(false) }

    ScreenScroll {
        SectionCard(title = "Profile") {
            DetailRow("Name", session.user?.fullName ?: "—")
            DetailRow("Email", session.user?.email ?: "—")
            DetailRow("Role", Format.label(session.user?.role))
            OutlinedButton(
                onClick = { editingProfile = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.Edit, contentDescription = null)
                Text("  Edit profile")
            }
        }

        session.masjid?.let { masjid ->
            SectionCard(title = "Masjid") {
                DetailRow("Name", masjid.name)
                DetailRow("City", masjid.city ?: "—")
                DetailRow("Timezone", masjid.timezone)
                DetailRow("Currency", masjid.currency)
                DetailRow("Public page", "/m/${masjid.slug}")
            }
        }

        SectionCard(title = "Security") {
            OutlinedButton(
                onClick = { changingPassword = true },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.Lock, contentDescription = null)
                Text("  Change password")
            }
        }

        Button(
            onClick = { confirmingSignOut = true },
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.error,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
        ) {
            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
            Text("  Sign out")
        }
    }

    if (editingProfile) {
        EditProfileDialog(session) { editingProfile = false }
    }
    if (changingPassword) {
        ChangePasswordDialog(session) { changingPassword = false }
    }
    if (confirmingSignOut) {
        AlertDialog(
            onDismissRequest = { confirmingSignOut = false },
            title = { Text("Sign out of MasjidHub?") },
            text = { Text("You'll need your email and password to sign back in.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmingSignOut = false
                    session.signOut()
                }) { Text("Sign out") }
            },
            dismissButton = {
                TextButton(onClick = { confirmingSignOut = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun EditProfileDialog(session: SessionViewModel, onDismiss: () -> Unit) {
    var firstName by remember { mutableStateOf(session.user?.firstName.orEmpty()) }
    var lastName by remember { mutableStateOf(session.user?.lastName.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Edit profile") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = firstName,
                    onValueChange = { firstName = it },
                    label = { Text("First name") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = lastName,
                    onValueChange = { lastName = it },
                    label = { Text("Last name") },
                    singleLine = true,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving && firstName.isNotBlank() && lastName.isNotBlank(),
                onClick = {
                    saving = true
                    error = null
                    scope.launch {
                        try {
                            session.api.patch(
                                "/auth/me",
                                session.api.encode(
                                    UpdateProfileRequest.serializer(),
                                    UpdateProfileRequest(firstName.trim(), lastName.trim()),
                                ),
                                User.serializer(),
                            )
                            session.refreshProfile()
                            onDismiss()
                        } catch (e: Exception) {
                            error = e.message ?: "Could not save."
                        }
                        saving = false
                    }
                },
            ) { Text(if (saving) "Saving…" else "Save") }
        },
        dismissButton = {
            TextButton(enabled = !saving, onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun ChangePasswordDialog(session: SessionViewModel, onDismiss: () -> Unit) {
    var current by remember { mutableStateOf("") }
    var fresh by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val valid = current.isNotBlank() && fresh.length >= 12 && fresh == confirm

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Change password") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = current,
                    onValueChange = { current = it },
                    label = { Text("Current password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                )
                OutlinedTextField(
                    value = fresh,
                    onValueChange = { fresh = it },
                    label = { Text("New password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                )
                OutlinedTextField(
                    value = confirm,
                    onValueChange = { confirm = it },
                    label = { Text("Repeat new password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                )
                Text(
                    "At least 12 characters. Changing it signs you out everywhere.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving && valid,
                onClick = {
                    saving = true
                    error = null
                    scope.launch {
                        try {
                            session.api.postNoContent(
                                "/auth/change-password",
                                session.api.encode(
                                    ChangePasswordRequest.serializer(),
                                    ChangePasswordRequest(current, fresh),
                                ),
                            )
                            // The API revokes every session, so this device signs in again.
                            onDismiss()
                            session.signOut()
                        } catch (e: Exception) {
                            error = e.message ?: "Could not change the password."
                        }
                        saving = false
                    }
                },
            ) { Text(if (saving) "Saving…" else "Save") }
        },
        dismissButton = {
            TextButton(enabled = !saving, onClick = onDismiss) { Text("Cancel") }
        },
    )
}
