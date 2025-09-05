import { openSubmenu, openCloseSidebar, loadContent, highlightActiveLink, showLogoutConfirmation } from "./navbar.js";
import { initializePersonalInformation } from "./personalInformation.js";
import { initializeParkingAllotment } from "./parkingAllotment.js"
import { initializeParkingUsage } from "./parkingUsage.js";

openSubmenu();

function initializePageScripts() {
    if (document.querySelector("#edit-profile-button")) {
        initializePersonalInformation();
    }

    if (document.querySelector("#car-toggle") || document.querySelector("#live-toggle")) {
        initializeParkingAllotment();
    }

    if (document.querySelector("#peak-occupancy-chart")) {
        initializeParkingUsage();
    }
}

initializePageScripts();

document.addEventListener('DOMContentLoaded', () => {

    document.getElementById('open-submenu')?.addEventListener('click', () => openSubmenu());
    document.getElementById('open-sidebar')?.addEventListener('click', () => openCloseSidebar());
    document.getElementById('close-sidebar')?.addEventListener('click', () => openCloseSidebar());

    document.body.addEventListener('click', (event) => {
        const link = event.target.closest('a.js-link');

        if (link) {
            event.preventDefault();
            const url = link.getAttribute('href');
            loadContent(url).then(() => {
                initializePageScripts();
                highlightActiveLink();
                showLogoutConfirmation();
            });
        }
    });

    window.addEventListener('popstate', () => {
        loadContent(location.pathname, false);
        initializePageScripts();
    });

    highlightActiveLink();
    showLogoutConfirmation();
});