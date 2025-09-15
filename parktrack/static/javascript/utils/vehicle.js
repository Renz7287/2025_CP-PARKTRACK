export function initializeVehicleField(config) {
    const brandInput = document.getElementById(config.brandInputId);
    const modelInput = document.getElementById(config.modelInputId);

    const brandList = document.getElementById(config.brandListId);
    const modelList = document.getElementById(config.modelListId);

    const baseUrl = config.baseUrl;

    let currentBrandCode = '';

    if (brandInput) {
        brandInput.addEventListener('change', function () {
            if (brandInput.value) {
                document.querySelector('.model-error')?.remove();
            }

            if (!brandInput.value) {
                if (modelInput) modelInput.value = '';
            }
        });

        brandInput.addEventListener("input", () => {
            const selectedOption = Array.from(brandList.querySelectorAll('option'))
                .find(option => option.value === brandInput.value);
                
            if (selectedOption) {
                currentBrandCode = selectedOption.dataset.code;
                
                if (modelInput) modelInput.value = "";
                
                fetchModels(currentBrandCode);
            }        
        });
    }

    modelInput.addEventListener('focus', () => {
        document.querySelector('.model-error')?.remove();

        if (!brandInput.value) {
            let errorElement = document.createElement('p');
            errorElement.classList.add('model-error', 'text-red-500', 'text-sm', 'mt-1');
            errorElement.innerText = 'Please select a brand first.';
            modelInput.insertAdjacentElement('afterend', errorElement);
        }
    });

    
    function fetchModels(brandCode) {
        if (!brandCode) return;

        fetch(`${baseUrl}/get-models/?brand=${brandCode}`)
            .then(response => response.json())
            .then(data => {
                if (modelList) {
                    modelList.innerHTML = '';
                    data.models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.model_name;
                        option.setAttribute('data-code', model.id);
                        modelList.appendChild(option);
                    });

                    if (modelInput && modelInput.value ) {
                        const event = new Event('input', {bubbles: true});
                        modelInput.dispatchEvent(event);
                    }
                }
            });
    }
}