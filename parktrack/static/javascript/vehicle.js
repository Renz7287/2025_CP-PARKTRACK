export function initializeVehicleField(config) {
    const vehicleTypeInput = document.getElementById(config.vehicleTypeInputId);
    const brandInput = document.getElementById(config.brandInputId);
    const modelInput = document.getElementById(config.modelInputId);

    const brandList = document.getElementById(config.brandListId);
    const modelList = document.getElementById(config.modelListId);

    const baseUrl = config.baseUrl;

    let currentVehicleTypeCode = '';
    let currentBrandCode = '';

    if (vehicleTypeInput) {
        vehicleTypeInput.addEventListener("input", () => {
            const selectedOption = Array.from(vehicleTypeInput.querySelectorAll('option'))
                .find(option => option.value === vehicleTypeInput.value);
                
            if (selectedOption) {
                currentVehicleTypeCode = selectedOption.value;
                
                if (brandInput) brandInput.value = "";
                
                fetchBrands(currentVehicleTypeCode);
            }
        });
    }
    
    if (brandInput) {
        brandInput.addEventListener("input", () => {
            const selectedOption = Array.from(brandList.querySelectorAll('option'))
                .find(option => option.value === brandInput.value);
                
            if (selectedOption) {
                currentBrandCode = selectedOption.dataset.code;
                
                if (modelInput) modelInput.value = "";
                
                fetchModels(currentBrandCode);
            } else if (brandInput.value) {
                createBrandOrModelOption('brand', currentVehicleTypeCode, brandInput.value);
            }

        });
    }

    if (modelInput) {
        modelInput.addEventListener('input', () => {
            
            if (modelInput.value) {
                createBrandOrModelOption('model', currentBrandCode, modelInput.value);
            }
        })
    }

    function fetchBrands(vehicleTypeCode) {
        if (!vehicleTypeCode) return;

        fetch(`${baseUrl}/get-brands/?vehicle_type=${vehicleTypeCode}`)
            .then(response => response.json())
            .then(data => {
                if (brandList) {
                    brandList.innerHTML = '';
                    data.brands.forEach(brand => {
                        const option = document.createElement('option');
                        option.value = brand.brand_name;
                        option.setAttribute('data-code', brand.id);
                        brandList.appendChild(option);
                    });

                    if (brandInput && brandInput.value ) {
                        const event = new Event('input', {bubbles: true});
                        brandInput.dispatchEvent(event);
                    }
                }
            });
    }
    
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

    function createBrandOrModelOption(type, code, inputValue) {
        if (!inputValue) return;

        let url = '';

        if (type === 'brand') {
            url = `${baseUrl}/get-brands/?vehicle_type=${code}&brand=${encodeURIComponent(inputValue)}`;
        } else {
            url = `${baseUrl}/get-models/?brand=${code}&model=${encodeURIComponent(inputValue)}`;
        }

        fetch(url)
            .then(response => response.json())
            .then(data => {
                const items = type === 'brand' ? data.brands : data.models;
                const newOption = items[0];

                const option = document.createElement('option');
                option.value = type === 'brand' ? newOption.brand_name : newOption.model_name;
                option.setAttribute('data-code', newOption.id);
                brandList.appendChild(option);
            });
    }
}