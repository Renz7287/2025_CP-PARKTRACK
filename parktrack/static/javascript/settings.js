export function initializeSettings() {
    const modal = document.getElementById('edit-modal');
    const editBtn = document.getElementById('edit-profile-btn');
    const closeBtn = document.getElementById('close-modal');
    const cancelBtn = document.getElementById('cancel-edit');

    if (!modal || !editBtn) return;

    editBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    });

    const closeModal = () => {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    };

    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
}

initializeSettings();
