export function openSubmenu() {
    const submenu = document.getElementById('submenu');
    const arrow = document.getElementById('arrow');

    if (!submenu || !arrow) return;

    submenu.classList.toggle('hidden');
    arrow.classList.toggle('rotate-180');
}


export function openCloseSidebar() {
    const sidebar = document.querySelector('.js-sidebar');

    if (!sidebar) return;

    sidebar.classList.toggle('left-[-300px]');
}

const contentArea = document.getElementById('content');
   
export async function loadContent(url, addToHistory = true) {
    try {
        const response = await fetch(url, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })

        if (!response.ok) throw new Error(`Error loading ${url}`);

        const data = await response.text();
        contentArea.innerHTML = data;

        if (addToHistory) {
            history.pushState(null, '', url);
        }

        return true;
    } catch (error) {
        contentArea.innerHTML = '<p class="text-center text-red-500">Error loading page.</p>'

        return false;
    }
}

export function highlightActiveLink() {
    const links = document.querySelectorAll('.js-link');
    const currentUrl = window.location.pathname;

    links.forEach(link => {
        if (link.getAttribute('href') === currentUrl) {
            link.classList.add('bg-[#b62c2c]');
        } else {
            link.classList.remove('bg-[#b62c2c]');
        }
    });
}

export function showLogoutConfirmation() {
    const logoutButton = document.getElementById('logout-button');
    const logoutForm = document.getElementById('logout-form');

    if (logoutButton) {
        logoutButton.addEventListener('click', event => {
            event.preventDefault();

            Swal.fire({
                icon: 'warning',
                title: 'Do you really want to logout?',
                showCancelButton: true,             
                confirmButtonText: 'Yes, logout',
                customClass: {
                    cancelButton: 'px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100',
                    confirmButton: 'px-4 py-2 bg-[#7cd1f9] text-white rounded-md hover:bg-[#78cbf2]',
                    actions: 'space-x-4'
                },
                buttonsStyling: false,
            }).then(result => {
                if (result.isConfirmed) {
                    Swal.fire({
                        icon: 'success',
                        title: 'You have been logged out.',
                        showConfirmButton: true
                    }).then(() => {
                        logoutForm.submit();
                    })
                }
            })
        });
    }

}