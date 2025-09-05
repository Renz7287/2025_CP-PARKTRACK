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