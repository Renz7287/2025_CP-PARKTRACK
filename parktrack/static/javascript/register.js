import { initializeBarangayField } from "./utils/barangay.js";
import { initializeVehicleField } from "./utils/vehicle.js";

document.addEventListener('DOMContentLoaded', () => {

    (function () {
        const step1          = document.getElementById('step-1');
        const step2          = document.getElementById('step-2');
        const backBtn        = document.getElementById('back-to-step-1');
        const mobileBackBtn  = document.getElementById('back-to-step-1-mobile');
        const titleEl        = document.getElementById('form-title');
        const mobileTitleEl  = document.getElementById('form-title-mobile');

        function showStep(step) {
            if (step === 1) {
                step1.classList.remove('hidden');
                step2.classList.add('hidden');
                backBtn?.classList.add('hidden');
                mobileBackBtn?.classList.add('hidden');
                if (titleEl)       titleEl.textContent      = 'Registration';
                if (mobileTitleEl) mobileTitleEl.textContent = 'Registration';
            } else {
                step1.classList.add('hidden');
                step2.classList.remove('hidden');
                backBtn?.classList.remove('hidden');
                mobileBackBtn?.classList.remove('hidden');
                if (titleEl)       titleEl.textContent      = 'Vehicle Info';
                if (mobileTitleEl) mobileTitleEl.textContent = 'Vehicle Info';
            }
        }

        document.getElementById('next-to-step-2')?.addEventListener('click', () => showStep(2));
        backBtn?.addEventListener('click',       () => showStep(1));
        mobileBackBtn?.addEventListener('click', () => showStep(1));

        showStep(1);
    })();

    (function () {
        const dropzone    = document.getElementById('vehicle-image-dropzone');
        const input       = document.getElementById('vehicle-image-input');
        const preview     = document.getElementById('vehicle-image-preview');
        const placeholder = document.getElementById('vehicle-image-placeholder');
        const removeBtn   = document.getElementById('vehicle-image-remove');

        if (!dropzone || !input) return;

        dropzone.addEventListener('click', (e) => {
            if (e.target.closest('#vehicle-image-remove')) return;
            input.click();
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-[#940B26]', 'bg-red-50');
        });
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('border-[#940B26]', 'bg-red-50');
        });
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-[#940B26]', 'bg-red-50');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                setPreview(file);
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
            }
        });

        input.addEventListener('change', () => {
            const file = input.files[0];
            if (file) setPreview(file);
        });

        removeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            clearPreview();
        });

        function setPreview(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
                removeBtn?.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }

        function clearPreview() {
            input.value = '';
            preview.src = '#';
            preview.classList.add('hidden');
            placeholder.classList.remove('hidden');
            removeBtn?.classList.add('hidden');
        }
    })();

    initializeVehicleField({
        brandInputId: 'brand-dropdown',
        modelInputId: 'model-dropdown',
        brandListId:  'brand-list',
        modelListId:  'model-list',
        baseUrl:      '/vehicles'
    });

    const form = document.getElementById('register-form');
    if (!form) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(form);

        try {
            const response = await fetch(form.action, {
                method:  'POST',
                body:    formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });

            const data = await response.json();

            if (data.success) {
                clearErrors();
                Swal.fire({
                    icon: 'success',
                    title: `${data.message}`,
                    showConfirmButton: true,
                    customClass: {
                        confirmButton: 'px-4 py-2 bg-[#7cd1f9] text-white rounded-md hover:bg-[#78cbf2] focus:outline-none'
                    },
                    buttonsStyling: false
                }).then(() => {
                    window.location.href = '/login/';
                });
                return;
            }

            if (data.errors) {
                clearErrors();

                const step1Fields = ['user-first_name', 'user-middle_name', 'user-last_name', 'user-email', 'user-password1', 'user-password2'];
                const hasStep1Error = Object.keys(data.errors).some(k => step1Fields.includes(k));
                if (hasStep1Error) {
                    document.getElementById('back-to-step-1')?.click();
                }

                Object.entries(data.errors).forEach(([fieldName, fieldErrors]) => {
                    const field = form.querySelector(`[name=${fieldName}]`);
                    if (field) {
                        const errorEl = document.createElement('p');
                        errorEl.classList.add('text-red-500', 'text-xs', 'mt-1');
                        errorEl.innerText = fieldErrors.join(', ');
                        field.insertAdjacentElement('afterend', errorEl);
                    }
                });
            }

            if (data.errors?.__all__) {
                const formError = document.createElement('p');
                formError.classList.add('text-red-500', 'text-xs', 'mt-1');
                formError.innerText = data.errors.__all__.join(', ');
                form.prepend(formError);
            }

        } catch (error) {
            console.error('Error submitting form:', error);
        }
    });

    function clearErrors() {
        form.querySelectorAll('.text-red-500').forEach(el => el.remove());
    }
});