package app.masjidhub.staff.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.masjidhub.staff.data.CreatePaymentRequest
import app.masjidhub.staff.data.DuesSummary
import app.masjidhub.staff.data.Household
import app.masjidhub.staff.data.Payment
import app.masjidhub.staff.ui.SessionViewModel
import app.masjidhub.staff.ui.components.DetailRow
import app.masjidhub.staff.ui.components.Loader
import app.masjidhub.staff.ui.components.ScreenScroll
import app.masjidhub.staff.ui.components.SectionCard
import app.masjidhub.staff.ui.components.StatTile
import app.masjidhub.staff.util.Format
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

private data class Detail(val household: Household, val dues: DuesSummary)

@Composable
fun HouseholdDetailScreen(
    session: SessionViewModel,
    household: Household,
    refreshTick: Int,
) {
    val masjidId = session.masjidId ?: return
    var localTick by remember { mutableIntStateOf(0) }
    var recording by remember { mutableStateOf(false) }

    Loader(
        household.id,
        refreshTick,
        localTick,
        load = {
            Detail(
                household = session.api.get(
                    "/masjids/$masjidId/households/${household.id}",
                    Household.serializer(),
                ),
                dues = session.api.get(
                    "/masjids/$masjidId/households/${household.id}/dues",
                    DuesSummary.serializer(),
                ),
            )
        },
    ) { detail ->
        ScreenScroll {
            SectionCard(title = "Details") {
                DetailRow("Head", detail.household.headName)
                DetailRow("Status", Format.label(detail.household.status))
                DetailRow("Phone", detail.household.phone ?: "—")
                DetailRow("Email", detail.household.email ?: "—")
                DetailRow("Address", detail.household.addressLine1 ?: "—")
                DetailRow("City", detail.household.city ?: "—")
            }

            SectionCard(title = "Dues") {
                val dues = detail.dues
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatTile("Expected", Format.money(dues.expectedCents, dues.currency))
                    StatTile("Paid", Format.money(dues.paidCents, dues.currency))
                    StatTile(
                        "Balance",
                        Format.money(dues.balanceCents, dues.currency),
                        emphasis = dues.balanceCents > 0,
                    )
                }

                val amount = dues.feeAmountCents
                val frequency = dues.feeFrequency
                if (amount != null && frequency != null) {
                    DetailRow(
                        "Fee",
                        "${Format.money(amount, dues.currency)} · ${Format.label(frequency)}",
                    )
                    DetailRow("Since", Format.day(dues.feeStartOn))
                    dues.feeEndOn?.let { DetailRow("Stopped", Format.day(it)) }
                } else {
                    Text(
                        "No fee configured for this household.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                Button(onClick = { recording = true }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.Add, contentDescription = null)
                    Text("  Record payment")
                }

                if (dues.payments.isNotEmpty()) {
                    HorizontalDivider()
                    Text("Recent payments", style = MaterialTheme.typography.titleSmall)
                    dues.payments.take(8).forEach { payment ->
                        PaymentRow(payment, dues.currency)
                    }
                }
            }

            SectionCard(title = "Members", accessory = "${detail.household.memberCount}") {
                val members = detail.household.members.orEmpty()
                if (members.isEmpty()) {
                    Text(
                        "No members recorded.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else {
                    members.forEach { member ->
                        Row(Modifier.fillMaxWidth()) {
                            Column {
                                Text(member.fullName)
                                member.relationship?.let {
                                    Text(
                                        Format.label(it),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            Spacer(Modifier.weight(1f))
                            member.dateOfBirth?.let {
                                Text(
                                    Format.day(it),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    if (recording) {
        RecordPaymentDialog(
            session = session,
            householdId = household.id,
            onDismiss = { recording = false },
            onSaved = {
                recording = false
                localTick++
            },
        )
    }
}

@Composable
private fun PaymentRow(payment: Payment, currency: String) {
    Row(Modifier.fillMaxWidth()) {
        Column {
            Text(Format.day(payment.paidOn), style = MaterialTheme.typography.bodyMedium)
            (payment.periodLabel ?: payment.method)?.takeIf { it.isNotBlank() }?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.weight(1f))
        Text(Format.money(payment.amountCents, currency))
    }
}

@Composable
private fun RecordPaymentDialog(
    session: SessionViewModel,
    householdId: String,
    onDismiss: () -> Unit,
    onSaved: () -> Unit,
) {
    val masjidId = session.masjidId ?: return
    var amount by remember { mutableStateOf("") }
    var paidOn by remember { mutableStateOf(Format.today(session.masjid?.timezone)) }
    var method by remember { mutableStateOf("Cash") }
    var periodLabel by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // Rupees typed by hand, stored as cents.
    val cents = amount.trim().toDoubleOrNull()?.takeIf { it > 0 }?.let { (it * 100).roundToInt() }
    val validDate = Regex("""\d{4}-\d{2}-\d{2}""").matches(paidOn)

    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text("Record payment") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = amount,
                    onValueChange = { amount = it },
                    label = { Text("Amount") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    value = paidOn,
                    onValueChange = { paidOn = it },
                    label = { Text("Received on (YYYY-MM-DD)") },
                    singleLine = true,
                    isError = !validDate,
                )
                OutlinedTextField(
                    value = method,
                    onValueChange = { method = it },
                    label = { Text("Method (cash, UPI…)") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = periodLabel,
                    onValueChange = { periodLabel = it },
                    label = { Text("Period covered (optional)") },
                    singleLine = true,
                )
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            TextButton(
                enabled = !saving && cents != null && validDate,
                onClick = {
                    val value = cents ?: return@TextButton
                    saving = true
                    error = null
                    scope.launch {
                        try {
                            session.api.post(
                                "/masjids/$masjidId/households/$householdId/payments",
                                session.api.encode(
                                    CreatePaymentRequest.serializer(),
                                    CreatePaymentRequest(
                                        amountCents = value,
                                        paidOn = paidOn,
                                        method = method.ifBlank { null },
                                        periodLabel = periodLabel.ifBlank { null },
                                    ),
                                ),
                                Payment.serializer(),
                            )
                            onSaved()
                        } catch (e: Exception) {
                            error = e.message ?: "Could not save the payment."
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
