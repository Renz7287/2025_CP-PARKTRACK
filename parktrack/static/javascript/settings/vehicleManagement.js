import { initializeVehicleField } from "../utils/vehicle.js";

export function initializeVehicleManagement() {
    let table = $('#vehicles-table').DataTable({
        responsive: true,
        paging: true,
        searching: true,
        ordering: true,
        autoWidth: false,
        language: {
            search: "Search vehicles:",
            lengthMenu: "Show _MENU_ entries",
            info: "Showing _START_ to _END_ of _TOTAL_ vehicles",
            infoEmpty: "No vehicles available",
            zeroRecords: "No matching vehicles found",
        },
        columnDefs: [
            { orderable: false, targets: -1 }
        ]
    });

    const addVehicleButton = document.getElementById('add-vehicle-button');
    const editVehicleButton = document.querySelector('.js-edit-button');
    const deleteVehicleButton = document.querySelector('.js-delete-button');
    const vehicleModal = document.getElementById('vehicle-modal');

    if (!addVehicleButton || !editVehicleButton || !deleteVehicleButton) return;

    //  Image Dropzone
    const dropzone    = document.getElementById('vehicle-image-dropzone');
    const imageInput  = document.getElementById('vehicle-image-input');
    const preview     = document.getElementById('vehicle-image-preview');
    const placeholder = document.getElementById('vehicle-image-placeholder');
    const removeBtn   = document.getElementById('vehicle-image-remove');

    if (dropzone && imageInput) {
        // Prevent input click from bubbling back up to dropzone
        imageInput.addEventListener('click', (e) => e.stopPropagation());

        dropzone.addEventListener('click', (e) => {
            if (removeBtn && removeBtn.contains(e.target)) return;
            imageInput.click();
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('border-[#7cd1f9]', 'bg-blue-50');
        });

        dropzone.addEventListener('dragleave', (e) => {
            e.stopPropagation();
            dropzone.classList.remove('border-[#7cd1f9]', 'bg-blue-50');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('border-[#7cd1f9]', 'bg-blue-50');

            const file = e.dataTransfer?.files?.[0];
            if (!file || !file.type.startsWith('image/')) return;

            const dt = new DataTransfer();
            dt.items.add(file);
            imageInput.files = dt.files;
            setImagePreview(file);
        });

        imageInput.addEventListener('change', () => {
            const file = imageInput.files?.[0];
            if (file) setImagePreview(file);
        });

        removeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            clearImagePreview();
        });
    }

    function setImagePreview(fileOrUrl) {
        if (typeof fileOrUrl === 'string') {
            // Existing image URL (edit mode)
            preview.src = fileOrUrl;
            preview.classList.remove('hidden');
            placeholder.classList.add('hidden');
            removeBtn?.classList.remove('hidden');
        } else {
            // New file selected
            const reader = new FileReader();
            reader.onload = (evt) => {
                preview.src = evt.target.result;
                preview.classList.remove('hidden');
                placeholder.classList.add('hidden');
                removeBtn?.classList.remove('hidden');
            };
            reader.readAsDataURL(fileOrUrl);
        }
    }

    function clearImagePreview() {
        if (imageInput) imageInput.value = '';
        if (preview) {
            preview.src = '#';
            preview.classList.add('hidden');
        }
        placeholder?.classList.remove('hidden');
        removeBtn?.classList.add('hidden');
    }

    //  Modal & Form Events 
    document.getElementById('content').addEventListener('click', async event => {
        if (event.target.closest('#add-vehicle-button')) {
            openModal('add');
        }

        if (event.target.closest('.js-edit-button')) {
            const button = event.target.closest('.js-edit-button');
            openModal(
                'edit',
                button.dataset.id,
                button.dataset.plateNumber,
                button.dataset.brand,
                button.dataset.model,
                button.dataset.color,
                button.dataset.vehicleImage   
            );
        }

        if (event.target.closest('#cancel-button')) {
            vehicleModal.classList.add('hidden');
            clearImagePreview();
        }

        if (event.target.closest('.js-delete-button')) {
            const button = event.target.closest('.js-delete-button');
            showDeleteConfirmation(button.dataset.id);
        }
    });

    initializeVehicleField({
        brandInputId: 'brand-dropdown',
        modelInputId: 'model-dropdown',
        brandListId: 'brand-list',
        modelListId: 'model-list',
        baseUrl: '/vehicles'
    });

    const form = document.getElementById('vehicle-form');
    if (!form) return;

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const formData = new FormData(form);

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });

            const data = await response.json();

            if (data.success) {
                clearErrors();
                vehicleModal.classList.add('hidden');
                clearImagePreview();

                if (data.html) {
                    table.destroy();
                    document.querySelector('#vehicles-table tbody').innerHTML = data.html;
                    table = $('#vehicles-table').DataTable({
                        responsive: true,
                        paging: true,
                        searching: true,
                        ordering: true,
                        autoWidth: false,
                        language: {
                            search: "Search vehicles:",
                            lengthMenu: "Show _MENU_ entries",
                            info: "Showing _START_ to _END_ of _TOTAL_ vehicles",
                            infoEmpty: "No vehicles available",
                            zeroRecords: "No matching vehicles found",
                        },
                        columnDefs: [{ orderable: false, targets: -1 }]
                    });
                }

                if (data.message) {
                    Swal.fire({
                        icon: 'success',
                        title: `${data.message}`,
                        showConfirmButton: true,
                        customClass: {
                            confirmButton: 'px-4 py-2 bg-[#7cd1f9] text-white rounded-md hover:bg-[#78cbf2] focus:outline-none'
                        },
                        buttonsStyling: false
                    });
                }
                return;
            }

            if (data.errors) {
                clearErrors();
                Object.entries(data.errors).forEach(([fieldName, fieldErrors]) => {
                    const field = form.querySelector(`[name=${fieldName}]`);
                    if (field) {
                        const errorEl = document.createElement('p');
                        errorEl.classList.add('text-red-500', 'text-sm', 'mt-1');
                        errorEl.innerText = fieldErrors.join(', ');
                        field.insertAdjacentElement('afterend', errorEl);
                    }
                });
            }

            if (data.errors?.__all__) {
                const formError = document.createElement('p');
                formError.classList.add('text-red-500', 'text-sm', 'mt-1');
                formError.innerText = data.errors.__all__.join(', ');
                form.prepend(formError);
            }

        } catch (error) {
            console.error('Error submitting form:', error);
        }
    });

    function openModal(mode, id = null, plateNumber = '', brand = '', model = '', color = '', vehicleImage = '') {
        const title = document.getElementById('form-title');
        const submitButton = document.getElementById('submit-button');
        const brandList = document.getElementById('brand-list');
        const brandInput = document.getElementById('brand-dropdown');
        const modelInput = document.getElementById('model-dropdown');
        const modelList = document.getElementById('model-list');

        clearImagePreview();
        clearErrors();

        if (mode === 'add') {
            form.action = '/settings/add-vehicle/';
            title.textContent = 'Add New Vehicle';
            submitButton.textContent = 'Add Vehicle';
            form.reset();

        } else if (mode === 'edit') {
            form.action = `/settings/edit-vehicle/${id}/`;
            title.textContent = 'Edit Vehicle';
            submitButton.textContent = 'Save Changes';

            document.getElementById('id_plate_number').value = plateNumber;
            brandInput.value = brand;
            modelInput.value = model;
            document.getElementById('id_color').value = color;

            // Load existing vehicle image into preview if available
            if (vehicleImage) {
                setImagePreview(vehicleImage);
            }

            const preselectedOption = Array.from(brandList.querySelectorAll('option'))
                .find(option => option.value === brandInput.value);

            if (preselectedOption) {
                const brandCode = preselectedOption.dataset.code;
                fetch(`/vehicles/get-models/?brand=${brandCode}`)
                    .then(res => res.json())
                    .then(data => {
                        if (modelList) {
                            modelList.innerHTML = '';
                            data.models.forEach(m => {
                                const option = document.createElement('option');
                                option.value = m.model_name;
                                option.setAttribute('data-code', m.id);
                                modelList.appendChild(option);
                            });
                            if (modelInput?.value) {
                                modelInput.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }
                    });
            }
        }

        vehicleModal.classList.remove('hidden');
    }

    function showDeleteConfirmation(vehicleId) {
        Swal.fire({
            icon: 'warning',
            title: 'Are you sure you want to delete this vehicle?',
            showCancelButton: true,
            confirmButtonText: 'Delete vehicle',
            customClass: {
                cancelButton: 'px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100',
                confirmButton: 'px-4 py-2 bg-[#9D0E15] text-white rounded-md hover:bg-[#7a0b10]',
                actions: 'space-x-4'
            },
            buttonsStyling: false,
        }).then(result => {
            if (result.isConfirmed) deleteVehicle(vehicleId);
        });
    }

    async function deleteVehicle(vehicleId) {
        try {
            const response = await fetch(`/settings/delete-vehicle/${vehicleId}/`, {
                method: 'POST',
                headers: {
                    'X-CsrfToken': getCookie('csrftoken'),
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const data = await response.json();

            if (data.success) {
                const row = document.getElementById(`vehicle-row-${vehicleId}`);
                if (row) row.remove();
                Swal.fire({ icon: 'success', title: 'Vehicle deleted successfully!', showConfirmButton: true });
            } else {
                Swal.fire({ icon: 'error', title: 'Failed to delete vehicle.', showConfirmButton: true });
            }
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'Request failed.', text: error.message });
        }
    }

    function getCookie(name) {
        const value = document.cookie.split('; ').find(row => row.startsWith(name + '='));
        return value ? decodeURIComponent(value.split('=')[1]) : null;
    }

    function clearErrors() {
        form.querySelectorAll('.text-red-500').forEach(el => el.remove());
    }
}