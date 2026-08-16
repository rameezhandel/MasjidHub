package app.masjidhub.staff.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.PermanentDrawerSheet
import androidx.compose.material3.PermanentNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.masjidhub.staff.data.Household
import app.masjidhub.staff.ui.screens.AccountScreen
import app.masjidhub.staff.ui.screens.AnnouncementsScreen
import app.masjidhub.staff.ui.screens.DuesScreen
import app.masjidhub.staff.ui.screens.EventsScreen
import app.masjidhub.staff.ui.screens.HouseholdDetailScreen
import app.masjidhub.staff.ui.screens.HouseholdsScreen
import app.masjidhub.staff.ui.screens.LoginScreen
import app.masjidhub.staff.ui.screens.OverviewScreen
import app.masjidhub.staff.ui.screens.PrayerTimesScreen
import app.masjidhub.staff.ui.theme.accentGold
import kotlinx.coroutines.launch

/** The sections of the app, in drawer order. */
enum class Destination(val title: String, val icon: ImageVector) {
    Overview("Overview", Icons.Filled.Dashboard),
    PrayerTimes("Prayer times", Icons.Filled.DateRange),
    Households("Households", Icons.Filled.Groups),
    Dues("Dues", Icons.Filled.Payments),
    Announcements("Announcements", Icons.Filled.Campaign),
    Events("Events", Icons.Filled.Event),
    Account("Account", Icons.Filled.AccountCircle),
}

@Composable
fun MasjidHubApp(session: SessionViewModel, widthClass: WindowWidthSizeClass) {
    when (session.state) {
        is SessionState.Loading -> Box(
            Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center,
        ) { CircularProgressIndicator(color = accentGold) }

        is SessionState.SignedOut -> LoginScreen(session)
        is SessionState.SignedIn -> SignedInApp(session, widthClass)
    }
}

/**
 * One layout serves both form factors: a tablet keeps the drawer open beside
 * the content, a phone gets the same drawer behind a menu button. No second
 * navigation model to maintain.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SignedInApp(session: SessionViewModel, widthClass: WindowWidthSizeClass) {
    var destination by remember { mutableStateOf(Destination.Overview) }
    var openHousehold by remember { mutableStateOf<Household?>(null) }
    var refreshTick by remember { mutableIntStateOf(0) }

    val expanded = widthClass == WindowWidthSizeClass.Expanded
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

    BackHandler(enabled = openHousehold != null) { openHousehold = null }

    val drawerContent: @Composable () -> Unit = {
        DrawerItems(
            current = destination,
            masjidName = session.masjid?.name,
            onSelect = { next ->
                destination = next
                // Changing section drops any open household, so back always means "up".
                openHousehold = null
                if (!expanded) scope.launch { drawerState.close() }
            },
        )
    }

    val body: @Composable () -> Unit = {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(openHousehold?.familyName ?: destination.title) },
                    navigationIcon = {
                        if (!expanded) {
                            IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Icon(Icons.Filled.Menu, contentDescription = "Menu")
                            }
                        }
                    },
                    actions = {
                        IconButton(onClick = { refreshTick++ }) {
                            Icon(Icons.Filled.Refresh, contentDescription = "Refresh")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        titleContentColor = MaterialTheme.colorScheme.onPrimary,
                        navigationIconContentColor = MaterialTheme.colorScheme.onPrimary,
                        actionIconContentColor = MaterialTheme.colorScheme.onPrimary,
                    ),
                )
            },
        ) { padding ->
            Box(
                Modifier
                    .fillMaxSize()
                    .padding(padding),
            ) {
                val household = openHousehold
                if (household != null) {
                    HouseholdDetailScreen(session, household, refreshTick)
                } else {
                    when (destination) {
                        Destination.Overview -> OverviewScreen(session, refreshTick)
                        Destination.PrayerTimes -> PrayerTimesScreen(session, refreshTick)
                        Destination.Households ->
                            HouseholdsScreen(session, refreshTick) { openHousehold = it }
                        Destination.Dues -> DuesScreen(session, refreshTick)
                        Destination.Announcements -> AnnouncementsScreen(session, refreshTick)
                        Destination.Events -> EventsScreen(session, refreshTick)
                        Destination.Account -> AccountScreen(session)
                    }
                }
            }
        }
    }

    if (expanded) {
        PermanentNavigationDrawer(
            drawerContent = { PermanentDrawerSheet { drawerContent() } },
            content = body,
        )
    } else {
        ModalNavigationDrawer(
            drawerState = drawerState,
            drawerContent = { ModalDrawerSheet { drawerContent() } },
            content = body,
        )
    }
}

@Composable
private fun DrawerItems(
    current: Destination,
    masjidName: String?,
    onSelect: (Destination) -> Unit,
) {
    Text(
        text = masjidName ?: "MasjidHub",
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 28.dp, top = 24.dp, bottom = 12.dp, end = 16.dp),
    )
    Destination.entries.forEach { item ->
        NavigationDrawerItem(
            icon = { Icon(item.icon, contentDescription = null) },
            label = { Text(item.title) },
            selected = item == current,
            onClick = { onSelect(item) },
            modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding),
        )
    }
}
