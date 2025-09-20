import { initializeBarangayField } from '../utils/barangay.js';

export function initializePersonalInformation() {
    const profileEditButton = document.getElementById('profile-edit-button');
    const profileCancelButton = document.getElementById('profile-cancel-button');
    const passwordEditButton = document.getElementById('password-edit-button');
    const passwordCancelButton = document.getElementById('password-cancel-button');
    const editProfileForm = document.getElementById('edit-profile-form');
    const editPasswordForm = document.getElementById('edit-password-form');
    const profilePicture = document.getElementById('profile-picture');
    const profilePictureLabel = document.querySelector('label[for="profile-picture-input"]');
    const profilePictureInput = document.getElementById('profile-picture-input');
    
    if (!profileEditButton || !passwordEditButton) return;

    let originalValues = {};
    let originalProfilePicture = profilePicture.src;

    function enableForm(formId) {
        const form = document.getElementById(formId);
        const fields = form.querySelectorAll('.editable-field');
        const editButton = form.querySelector("[id$='edit-button']");
        const cancelButton = form.querySelector("[id$='cancel-button']");
        const saveButton = form.querySelector("[id$='save-button']");

        fields.forEach(field => {
            originalValues[field.name] = field.value;

            field.disabled = false;

            field.classList.remove('bg-transparent');
            field.classList.add('bg-gray-100', 'border', 'border-gray-300', 'rounded');
        });

        if (formId === 'edit-profile-form') {
            if (profilePictureLabel) {
                profilePictureLabel.classList.remove('cursor-not-allowed', 'opacity-50');
                profilePictureLabel.classList.add('cursor-pointer', 'hover:bg-[#78cbf2]');
            }
        }

        editButton.classList.add('hidden');
        saveButton.classList.remove('hidden');
        cancelButton.classList.remove('hidden');
    }

    function disableForm(formId) {
        const form = document.getElementById(formId)
        const fields = form.querySelectorAll('.editable-field');
        const editButton = form.querySelector("[id$='edit-button']");
        const cancelButton = form.querySelector("[id$='cancel-button']");
        const saveButton = form.querySelector("[id$='save-button']");

        fields.forEach(field => {
            field.disabled = true;

            field.classList.add('bg-transparent');
            field.classList.remove('bg-gray-100', 'border', 'border-gray-300', 'rounded');
        });

        if (formId === 'edit-profile-form') {
            if (profilePictureLabel) {
                profilePictureLabel.classList.add('cursor-not-allowed', 'opacity-50');
                profilePictureLabel.classList.remove('cursor-pointer', 'hover:bg-[#78cbf2]');
            }
        }

        editButton.classList.remove('hidden');
        saveButton.classList.add('hidden');
        cancelButton.classList.add('hidden');
    }

    function cancelEdit(formId) {
        const form = document.getElementById(formId);
        const fields = form.querySelectorAll('.editable-field');

        fields.forEach(field => {
            if (originalValues[field.name] !== undefined) {
                field.value = originalValues[field.name];
            }
        });
        
        profilePicture.src = originalProfilePicture;
        if (profilePictureInput) {
            profilePictureInput.value = '';
        }
        
        disableForm(formId);
        clearErrors(form);
    }
    
    disableForm('edit-profile-form');
    disableForm('edit-password-form');

    profileEditButton.addEventListener('click', () => enableForm('edit-profile-form'));
    profileCancelButton.addEventListener('click', () => cancelEdit('edit-profile-form'));
    passwordEditButton.addEventListener('click', () => enableForm('edit-password-form'));
    passwordCancelButton.addEventListener('click', () => cancelEdit('edit-password-form'));
    
    if (profilePictureInput) {
        profilePictureInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            
            if (file) {
                const reader = new FileReader();

                reader.onload = (event) => {
                    profilePicture.src = event.target.result;
                }

                reader.readAsDataURL(file);
            }
        });
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

    function attachAJAXSubmit(formId) {
        const form = document.getElementById(formId);

        if (!form) return;
    
        form.addEventListener('submit', async event => {
            event.preventDefault();
    
            const formData = new FormData(form);
            
            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                });
    
                const data = await response.json();
    
                if (data.success) {
                    // Reload the page on success
                    console.log(data.success);
                    location.reload();
                    return;
                }
    
                if (data.errors) {
                    clearErrors(form);
    
                    Object.entries(data.errors).forEach(([fieldName, fieldErrors]) => {
                        const field = form.querySelector(`[name="${fieldName}"]`);
    
                        if (field) {
                            let errorElement = document.createElement('p');
                            errorElement.classList.add('text-red-500', 'text-sm', 'mt-1');
                            errorElement.innerText = fieldErrors.join(', ');
                            field.insertAdjacentElement('afterend', errorElement);
                        }
                    });
                }
    
                if (data.errors && data.errors.__all__){
                    let formError = document.createElement('p');
                    formError.classList.add('text-red-500', 'text-sm', 'mt-1');
                    formError.innerText = data.errors.__all__.join(', ');
                    form.prepend(formError);
                }
    
            } catch (error) {
                console.log('Error submitting form:', error);
            }
        });
    }

    function clearErrors(form) {
        if (form) {
            const errorElements = form.querySelectorAll('.text-red-500');
            errorElements.forEach(element => element.remove());
        }
    }

    attachAJAXSubmit('edit-profile-form');
    attachAJAXSubmit('edit-password-form');
}

document.addEventListener('DOMContentLoaded', function() {
    initializePersonalInformation();
});