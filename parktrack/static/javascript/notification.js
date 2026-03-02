const CSRF_TOKEN = document.cookie.match(/csrftoken=([^;]+)/)?.[1] ?? '';

async function post(url) {
    return fetch(url, {
        method: 'POST',
        headers: { 'X-CSRFToken': CSRF_TOKEN }
    });
}

function markItemRead(id) {
    const item = document.querySelector(`.notif-item[data-id="${id}"]`);
    if (!item) return;

    item.classList.remove('border-[#940B26]');
    item.classList.add('border-transparent', 'opacity-60');
    item.querySelector('p')?.classList.remove('font-semibold');
    item.querySelector('.mark-one-read')?.remove();
}

export function initializeNotifications() {
    document.getElementById('mark-all-read-btn')?.addEventListener('click', async () => {
        await post('/notification/mark-all-read/');
        document.querySelectorAll('.notif-item').forEach(el => {
            const id = el.dataset.id;
            markItemRead(id);
        });
        updateBadge(0);
        document.querySelector('.notifications-section p span')?.closest('p')
            ?.replaceWith(Object.assign(document.createElement('p'), {
                className: 'text-sm text-gray-500',
                textContent: "You're all caught up"
            }));
    });

    document.getElementById('notifications-list')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.mark-one-read');
        if (!btn) return;

        const id = btn.dataset.id;
        await post(`/notification/mark-read/${id}/`);
        markItemRead(id);

        const remaining = document.querySelectorAll('.mark-one-read').length;
        updateBadge(remaining);
    });
}

function updateBadge(count) {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

export async function pollUnreadCount() {
    try {
        const res = await fetch('/notification/unread-count/', {
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        const { count } = await res.json();
        updateBadge(count);
    } catch (_) {}
}