import { initializeBarangayField } from "./utils/barangay.js";
import { initializeVehicleField } from "./utils/vehicle.js";

document.addEventListener('DOMContentLoaded', () => {
    // Activates stepper form for small devices
    (function () {
        const mediaQuery = window.matchMedia('(min-width: 768px)');

        const stepsSmallDevices = [
            document.getElementById('step-personal'),
            document.getElementById('step-contact'),
            document.getElementById('step-vehicle'),
            document.getElementById('step-credentials')
        ];
        const stepsLargeDevices = [
            document.getElementById('step-1'),
            document.getElementById('step-2')
        ]

        let currentSteps = stepsSmallDevices;

        let page = 0;

        function setStep(newIndex) {
            page = newIndex;
            currentSteps.forEach((step, index) => step.classList.toggle('hidden', index !== page));

            if (page === 1) {
                document.getElementById('back-to-step-1')?.classList.remove('hidden');
            } else {
                document.getElementById('back-to-step-1')?.classList.add('hidden');
            }
        }

        function toggleStepper() {
            if (mediaQuery.matches) {
                currentSteps = stepsLargeDevices;
            } else {
                document.getElementById('step-1').classList.remove('hidden');
                document.getElementById('step-2').classList.remove('hidden');
                currentSteps = stepsSmallDevices;
            }

            currentSteps.forEach(step => step.classList.add('hidden') );

            setStep(0);
        }

        document.getElementById('next-to-contact')?.addEventListener('click', () => setStep(1));
        document.getElementById('back-to-personal')?.addEventListener('click', () => setStep(0));
        document.getElementById('next-to-vehicle')?.addEventListener('click', () => setStep(2));
        document.getElementById('back-to-contact')?.addEventListener('click', () => setStep(1));
        document.getElementById('next-to-credentials')?.addEventListener('click', () => setStep(3));
        document.getElementById('back-to-vehicle')?.addEventListener('click', () => setStep(2));
        
        document.getElementById('next-to-step-2')?.addEventListener('click', () => setStep(1));
        document.getElementById('back-to-step-1')?.addEventListener('click', () => setStep(0));

        mediaQuery.addEventListener 
            ? mediaQuery.addEventListener('change', toggleStepper) 
            : mediaQuery.addListener(toggleStepper);

        toggleStepper();
        
    })();

    initializeBarangayField(
        {
            cityInputId: 'city-dropdown',
            barangayInputId: 'barangay-dropdown',
            cityListId: 'city-list',
            barangayListId: 'barangay-list',
            baseUrl: '/address' 
        }
    );

    initializeVehicleField(
        {
            brandInputId: 'brand-dropdown',
            modelInputId: 'model-dropdown',
            brandListId: 'brand-list',
            modelListId: 'model-list',
            baseUrl: '/vehicles'
        }
    )

    const form = document.getElementById('register-form');

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
                }
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
                    window.location.href = "/";
                });

                return;
            }

            if (data.errors) {
                clearErrors();
                
                Object.entries(data.errors).forEach(([fieldName, fieldErrors]) => {
                    const field = form.querySelector(`[name=${fieldName}]`);

                    if (field) {
                        
                        let errorElement = document.createElement('p');
                        errorElement.classList.add('text-red-500', 'text-xs', 'mt-1');
                        errorElement.innerText = fieldErrors.join(', ');
                        field.insertAdjacentElement('afterend', errorElement);
                    }
                });
            }

            if (data.errors.__all__) {
                let formError = document.createElement('p');
                formError.classList.add('text-red-500', 'text-xs', 'mt-1');
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
})