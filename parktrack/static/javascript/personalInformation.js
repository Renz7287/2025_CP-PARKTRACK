import { initializeBarangayField } from './barangay.js';

export function initializePersonalInformation() {
    const modal = document.getElementById('edit-modal');
    const editButton = document.getElementById('edit-profile-button');
    
    if (!editButton) return;

    document.getElementById('content').addEventListener('click', (event) => {
        if (event.target.closest('#edit-profile-button')) {
            modal.classList.remove('hidden');
        }

        if (event.target.closest('#cancel-edit')) {
            modal.classList.add('hidden');
            clearErrors();

            const originalSrc = previewImage.dataset.originalSrc;
            previewImage.src = originalSrc;

            fileInput.value = '';
            
            form.reset();
        }
    })

    const fileInput = document.getElementById('profile-picture-input');
    const previewImage = document.getElementById('modal-profile-picture');

    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            
            if (file) {
                const reader = new FileReader();

                reader.onload = (event) => {
                    previewImage.src = event.target.result;
                }

                reader.readAsDataURL(file);
            }
        })
    }

    initializeBarangayField(
        {
            cityInputId: 'city-dropdown',
            barangayInputId: 'barangay-dropdown',
            cityListId: 'city-list',
            barangayListId: 'barangay-list',
            baseUrl: '/address' 
        }
    );

    const form = document.getElementById('edit-profile-form');

    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(form);

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            const data = await response.json();

            if (data.success) {

                modal.classList.add('hidden');
                location.reload();
                return;

            }

            if (data.errors) {
                clearErrors();

                Object.entries(data.errors).forEach(([fieldName, fieldErrors]) => {
                    const field = form.querySelector(`[name=${fieldName}]`);

                    if (field) {

                        let errorElement = document.createElement('p');
                        errorElement.classList.add('text-red-500', 'text-sm', 'mt-1');
                        errorElement.innerText = fieldErrors.join(', ');
                        field.insertAdjacentElement('afterend', errorElement);

                    }
                });
            }

            if (data.errors.__all__){
                let formError = document.createElement('p');
                formError.classList.add('text-red-500', 'text-sm', 'mt-1');
                formError.innerText = data.errors.__all__.join(', ');
                form.prepend(formError);
            }

        } catch (error) {
            console.log('Error submitting form:', error);
        }

    });

    function clearErrors() {
        form.querySelectorAll('.text-red-500').forEach(element => element.remove());
    }
}