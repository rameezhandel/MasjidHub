package app.masjidhub.staff.ui.screens

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.masjidhub.staff.data.DuesList
import app.masjidhub.staff.data.DuesRow
import app.masjidhub.staff.data.DuesTotals
import app.masjidhub.staff.data.endpoint
import app.masjidhub.staff.ui.SessionViewModel
import app.masjidhub.staff.ui.components.EmptyState
import app.masjidhub.staff.ui.components.ErrorState
import app.masjidhub.staff.ui.components.NoMasjid
import app.masjidhub.staff.ui.components.SectionCard
import app.masjidhub.staff.ui.components.StatTile
import app.masjidhub.staff.ui.components.rememberPaged
import app.masjidhub.staff.ui.theme.accentGold
import app.masjidhub.staff.util.Format
import kotlinx.coroutines.delay

private val FILTERS = listOf(
    "all" to "All",
    "owing" to "Owing",
    "settled" to "Settled",
    "no-fee" to "No fee set",
)

@Composable
fun DuesScreen(session: SessionViewModel, refreshTick: Int) {
    val masjidId = session.masjidId ?: return NoMasjid()

    var query by remember { mutableStateOf("") }
    var search by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf("all") }
    var totals by remember { mutableStateOf<DuesTotals?>(null) }

    LaunchedEffect(query) {
        delay(350)
        search = query
    }

    val paged = rememberPaged<DuesRow>(masjidId, refreshTick, search, filter) { page ->
        val result = session.api.get(
            endpoint(
                "/masjids/$masjidId/dues",
                mapOf(
                    "page" to "$page",
                    "pageSize" to "25",
                    "filter" to filter,
                    "search" to search.ifBlank { null },
                ),
            ),
            DuesList.serializer(),
        )
        // Totals cover the whole masjid, not just this page.
        totals = result.totals
        result.data to result.meta
    }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Family or head of household") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        )
        Row(
            modifier = Modifier
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            FILTERS.forEach { (value, label) ->
                FilterChip(
                    selected = filter == value,
                    onClick = { filter = value },
                    label = { Text(label) },
                )
            }
        }

        val error = paged.error
        when {
            error != null -> ErrorState(error) { paged.retry() }
            paged.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = accentGold)
            }
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                totals?.let { figures ->
                    item {
                        SectionCard(title = "Collection", modifier = Modifier.widthIn(max = 720.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                StatTile(
                                    "Expected",
                                    Format.money(figures.expectedCents, figures.currency),
                                )
                                StatTile(
                                    "Collected",
                                    Format.money(figures.paidCents, figures.currency),
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                StatTile(
                                    "Outstanding",
                                    Format.money(figures.balanceCents, figures.currency),
                                    emphasis = figures.balanceCents > 0,
                                )
                                StatTile("Owing", "${figures.owingHouseholds}")
                                StatTile("No fee", "${figures.withoutFee}")
                            }
                        }
                    }
                }

                if (paged.items.isEmpty()) {
                    item {
                        EmptyState(
                            icon = Icons.Filled.Payments,
                            title = "Nothing to show",
                            detail = "No household matches this filter.",
                        )
                    }
                }

                items(paged.items, key = { it.id }) { row ->
                    DuesRowView(row, totals?.currency ?: "INR", Modifier.widthIn(max = 720.dp))
                }

                if (paged.canLoadMore) {
                    item {
                        Button(onClick = { paged.loadMore() }, enabled = !paged.loadingMore) {
                            Text(if (paged.loadingMore) "Loading…" else "Load more")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DuesRowView(row: DuesRow, currency: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(row.familyName, style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.weight(1f))
            Text(
                Format.money(row.balanceCents, currency),
                fontWeight = FontWeight.SemiBold,
                color = if (row.balanceCents > 0) accentGold else MaterialTheme.colorScheme.primary,
            )
        }
        Text(
            row.headName,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        val fee = row.feeAmountCents
        val frequency = row.feeFrequency
        Text(
            listOfNotNull(
                if (fee != null && frequency != null) {
                    "${Format.money(fee, currency)} · ${Format.label(frequency)}"
                } else {
                    "No fee set"
                },
                "Paid ${Format.money(row.paidCents, currency)}",
            ).joinToString(" · "),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
