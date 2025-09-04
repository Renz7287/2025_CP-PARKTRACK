export function initializeSettings() {
    const modal = document.getElementById('edit-modal');
    const editButton = document.getElementById('edit-profile-button');
    const cancelButton = document.getElementById('cancel-edit');

    if (!editButton) return;

    document.getElementById('content').addEventListener('click', (event) => {
        if (event.target.closest('#edit-profile-button')) {
            modal.classList.remove('hidden');
        }

        if (event.target.closest('#cancel-edit')) {
            modal.classList.add('hidden');
        }
    })
}