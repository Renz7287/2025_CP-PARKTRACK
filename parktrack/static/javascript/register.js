import { initializeBarangayField } from "./barangay.js";
import { initializeVehicleField } from "./vehicle.js";

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

document.addEventListener('DOMContentLoaded', () => {
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
            vehicleTypeInputId: 'vehicle-type-dropdown',
            brandInputId: 'brand-dropdown',
            modelInputId: 'model-dropdown',
            brandListId: 'brand-list',
            modelListId: 'model-list',
            baseUrl: '/vehicles'
        }
    )
});