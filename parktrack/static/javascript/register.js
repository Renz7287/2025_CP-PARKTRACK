import { initializeBarangayField } from "./barangay.js";

(function () {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const steps = [
        document.getElementById('step-personal'),
        document.getElementById('step-contact'),
        document.getElementById('step-vehicle'),
        document.getElementById('step-credentials')
    ];
    let page = 0;

    function setStep(newIndex) {
        page = newIndex;
        steps.forEach((step, index) => step.classList.toggle('hidden', index !== page));
    }

    function toggleStepper() {
        if (mediaQuery.matches) {
            steps.forEach(step => step.classList.remove('hidden'));
        } else {
            steps.forEach(step => step.classList.add('hidden'));
            setStep(0);
        }
    }

    document.getElementById('next-to-contact')?.addEventListener('click', () => setStep(1));
    document.getElementById('back-to-personal')?.addEventListener('click', () => setStep(0));
    document.getElementById('next-to-vehicle')?.addEventListener('click', () => setStep(2));
    document.getElementById('back-to-contact')?.addEventListener('click', () => setStep(1));
    document.getElementById('next-to-credentials')?.addEventListener('click', () => setStep(3));
    document.getElementById('back-to-vehicle')?.addEventListener('click', () => setStep(2));

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
});