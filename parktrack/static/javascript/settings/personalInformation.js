import { initializeBarangayField } from '../utils/barangay.js';

export function initializePersonalInformation() {
    const editButton = document.getElementById('edit-profile-button');
    const saveButton = document.getElementById('save-changes-button');
    const cancelButton = document.getElementById('cancel-edit-button');
    const form = document.getElementById('edit-profile-form');
    const editableFields = document.querySelectorAll('.editable-field');
    const passwordFields = document.querySelectorAll('.password-field');
    const profilePictureInput = document.getElementById('profile-picture-input');
    const profilePicture = document.getElementById('profile-picture');
    const profilePictureLabel = document.querySelector('label[for="profile-picture-input"]');
    
    if (!editButton) return;

    // Store original values for cancel functionality
    let originalValues = {};
    let originalProfilePicture = profilePicture.src;
    let passwordOriginalValues = {};
    
    // Function to enable editing
    function enableEditing() {
        editableFields.forEach(field => {
            originalValues[field.name] = field.value;
            field.disabled = false;
            field.classList.remove('bg-transparent');
            field.classList.add('bg-gray-100', 'border', 'border-gray-300', 'rounded');
        });
        
        // Enable password fields
        passwordFields.forEach(field => {
            passwordOriginalValues[field.name] = field.value;
            field.disabled = false;
            field.classList.remove('bg-transparent');
            field.classList.add('bg-gray-100', 'border', 'border-gray-300', 'rounded');
        });
        
        // Enable profile picture upload
        if (profilePictureLabel) {
            profilePictureLabel.classList.remove('cursor-not-allowed', 'opacity-50');
            profilePictureLabel.classList.add('cursor-pointer', 'hover:bg-[#78cbf2]');
        }
        
        // Show save and cancel buttons, hide edit button
        editButton.classList.add('hidden');
        saveButton.classList.remove('hidden');
        cancelButton.classList.remove('hidden');
    }
    
    // Function to disable editing
    function disableEditing() {
        editableFields.forEach(field => {
            field.disabled = true;
            field.classList.remove('bg-gray-100', 'border', 'border-gray-300', 'rounded');
            field.classList.add('bg-transparent');
        });
        
        // Disable password fields
        passwordFields.forEach(field => {
            field.disabled = true;
            field.classList.remove('bg-gray-100', 'border', 'border-gray-300', 'rounded');
            field.classList.add('bg-transparent');
        });
        
        // Disable profile picture upload
        if (profilePictureLabel) {
            profilePictureLabel.classList.add('cursor-not-allowed', 'opacity-50');
            profilePictureLabel.classList.remove('cursor-pointer', 'hover:bg-[#78cbf2]');
        }
        
        // Show edit button, hide save and cancel buttons
        editButton.classList.remove('hidden');
        saveButton.classList.add('hidden');
        cancelButton.classList.add('hidden');
    }
    
    // Function to cancel editing and revert changes
    function cancelEditing() {
        editableFields.forEach(field => {
            if (originalValues[field.name] !== undefined) {
                field.value = originalValues[field.name];
            }
        });
        
        // Reset password fields
        passwordFields.forEach(field => {
            if (passwordOriginalValues[field.name] !== undefined) {
                field.value = passwordOriginalValues[field.name];
            }
        });
        
        // Reset profile picture to original
        profilePicture.src = originalProfilePicture;
        if (profilePictureInput) {
            profilePictureInput.value = '';
        }
        
        disableEditing();
        clearErrors();
    }

    // Initialize - disable all fields by default
    disableEditing();

    // Event listeners
    editButton.addEventListener('click', enableEditing);
    cancelButton.addEventListener('click', cancelEditing);
    
    // Handle profile picture change
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

    // Initialize barangay field
    initializeBarangayField(
        {
            cityInputId: 'city-dropdown',
            barangayInputId: 'barangay-dropdown',
            cityListId: 'city-list',
            barangayListId: 'barangay-list',
            baseUrl: '/address' 
        }
    );

    if (!form) return;

    // Form submission handler
    form.addEventListener('submit', async event => {
        event.preventDefault();

        // Check if password fields are empty and remove them from form data if so
        const formData = new FormData(form);
        let hasPasswordData = false;
        
        for (let field of passwordFields) {
            if (field.value.trim() !== '') {
                hasPasswordData = true;
                break;
            }
        }
        
        // If password fields are empty, don't include them in the submission
        if (!hasPasswordData) {
            passwordFields.forEach(field => {
                formData.delete(field.name);
            });
        }

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
                location.reload();
                return;
            }

            if (data.errors) {
                clearErrors();

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

    function clearErrors() {
        if (form) {
            const errorElements = form.querySelectorAll('.text-red-500');
            errorElements.forEach(element => element.remove());
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializePersonalInformation();
});