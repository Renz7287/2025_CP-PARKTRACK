export function initializeBarangayField(config) {
    const cityInput = document.getElementById(config.cityInputId);
    const barangayInput = document.getElementById(config.barangayInputId);

    const cityList = document.getElementById(config.cityListId);
    const barangayList = document.getElementById(config.barangayListId);

    const baseUrl = config.baseUrl;

    let currentCityCode = '';

    function fetchBarangays(cityCode) {
        if (!cityCode) return;

        fetch(`${baseUrl}/get-barangays/?city=${cityCode}`)
            .then(response => response.json())
            .then(data => {
                if (barangayList) {
                    barangayList.innerHTML = '';
                    data.barangays.forEach(barangay => {
                        const option = document.createElement('option');
                        option.value = barangay.brgyDesc;
                        option.setAttribute('data-code', barangay.brgyCode);
                        barangayList.appendChild(option);
                    });

                    if (barangayInput && barangayInput.value ) {
                        const event = new Event('input', {bubbles: true});
                        barangayInput.dispatchEvent(event);
                    }
                }
            })
    }

    if (cityInput) {
        cityInput.addEventListener("input", () => {
            const selectedOption = Array.from(cityList.querySelectorAll('option'))
                .find(option => option.value === cityInput.value);
                
            if (selectedOption) {
                currentCityCode = selectedOption.dataset.code;
                
                if (barangayInput) barangayInput.value = "";
                
                fetchBarangays(currentCityCode);
            }
        });
    }
}