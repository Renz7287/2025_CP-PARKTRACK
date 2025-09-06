import { openSubmenu, openCloseSidebar, loadContent, highlightActiveLink, showLogoutConfirmation } from "./navbar.js";
import { initializeParkingAllotment } from "./parkingAllotment.js";
import { initializeParkingUsage } from "./parkingUsage.js";
import { initializePersonalInformation } from "./settings/personalInformation.js";
import { initializeVehicleManagement } from "./settings/vehicleManagement.js";

openSubmenu();

function initializePageScripts() {
    if (document.querySelector('.parking-allotment')) {
        initializeParkingAllotment();
    }    
    
    if (document.querySelector('.parking-usage')) {
        initializeParkingUsage();
    }
    
    if (document.querySelector('.profile-information')) {
        initializePersonalInformation();
    }

    if (document.querySelector('.vehicle-management')) {
        initializeVehicleManagement();
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