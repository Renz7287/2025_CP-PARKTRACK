function openSubmenu() {
    document.getElementById('submenu').classList.toggle('hidden');
    document.getElementById('arrow').classList.toggle('rotate-180');
}

openSubmenu();

function openCloseSidebar() {
    document.querySelector('.js-sidebar').classList.toggle('left-[-300px]');
}

document.addEventListener('DOMContentLoaded', () => {
    const contentArea = document.getElementById('js-content');
   
    async function loadContent(url, addToHistory = true) {
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
        } catch (error) {
            contentArea.innerHTML = '<p class="text-[#DC143C]">Error loading page.</p>'
        }
    }

    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a.js-link');

        if (link) {
            e.preventDefault();
            const url = link.getAttribute('href');
            loadContent(url);
        }
    });

    window.addEventListener('popstate', () => {
        loadContent(location.pathname, false);
    });
});