import { openSubmenu, openCloseSidebar, loadContent, highlightActiveLink, showLogoutConfirmation } from "./navbar.js";
import { initializeParkingAllotment }      from "./parkingAllotment.js";
import { initializeParkingUsage }          from "./parkingUsage.js";
import { initializePersonalInformation }   from "./settings/personalInformation.js";
import { initializeVehicleManagement }     from "./settings/vehicleManagement.js";
import { initializeReservation }           from "./reservation.js";
import { initializeParkingSlotManagement } from "./settings/parkingSlotManagement.js";
import { initializeNotifications, pollUnreadCount } from "./notification.js";

openSubmenu();

function initializePageScripts() {
    if (document.querySelector('.parking-allotment'))       initializeParkingAllotment();
    if (document.querySelector('.parking-usage'))           initializeParkingUsage();
    if (document.querySelector('.profile-information'))     initializePersonalInformation();
    if (document.querySelector('.vehicle-management'))      initializeVehicleManagement();
    if (document.querySelector('.reservations-section'))    initializeReservation();
    if (document.querySelector('.parking-slot-management')) initializeParkingSlotManagement();
    if (document.querySelector('.notifications-section'))   initializeNotifications();
}

document.addEventListener('DOMContentLoaded', () => {
    initializePageScripts();
    pollUnreadCount();
    setInterval(pollUnreadCount, 60_000);
    document.getElementById('open-submenu')?.addEventListener('click', () => openSubmenu());
    document.getElementById('open-sidebar')?.addEventListener('click', () => openCloseSidebar());
    document.getElementById('close-sidebar')?.addEventListener('click', () => openCloseSidebar());

    // Close sidebar when clicking outside of it
    document.addEventListener('click', (event) => {
        const sidebar = document.querySelector('.js-sidebar');
        const openBtn = document.getElementById('open-sidebar');
        if (!sidebar) return;

        const isOpen = !sidebar.classList.contains('left-[-300px]');
        const clickedInsideSidebar = sidebar.contains(event.target);
        const clickedOpenBtn = openBtn?.contains(event.target);

        // Only close on mobile (sidebar is fixed/overlaying content)
        const isMobile = window.innerWidth < 768;

        if (isOpen && isMobile && !clickedInsideSidebar && !clickedOpenBtn) {
            openCloseSidebar();
        }
    });

    document.body.addEventListener('click', (event) => {
        const link = event.target.closest('a.js-link');
        if (link) {
            event.preventDefault();
            loadContent(link.getAttribute('href')).then(() => {
                initializePageScripts();
                highlightActiveLink();
                showLogoutConfirmation();
            });
        }
    });

    window.addEventListener('popstate', () => {
        loadContent(location.pathname, false).then(() => {
            initializePageScripts();
            highlightActiveLink();
        });
    });

    highlightActiveLink();
    showLogoutConfirmation();
});