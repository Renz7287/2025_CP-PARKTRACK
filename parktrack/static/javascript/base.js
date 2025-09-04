import { openSubmenu, openCloseSidebar, loadContent } from "./navbar.js";
import { initializeSettings } from "./settings.js";
import { initializeParkingAllotment } from "./parkingAllotment.js"
import { initializeParkingUsage } from "./parkingUsage.js";

openSubmenu();

function initializePageScripts() {
    if (document.querySelector("#edit-profile-button")) {
        initializeSettings();
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

    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a.js-link');

        if (link) {
            e.preventDefault();
            const url = link.getAttribute('href');
            loadContent(url).then(() => {
                initializePageScripts();
            });
        }
    });

    window.addEventListener('popstate', () => {
        loadContent(location.pathname, false);
        initializePageScripts();
    });

});