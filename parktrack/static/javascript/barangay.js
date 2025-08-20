export function initializeBarangayField(config) {
    console.log('Debug1');
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
                console.log('Debug3');
                if (barangayList) {
                    console.log('Debug4');
                    barangayList.innerHTML = '';
                    data.barangays.forEach(barangay => {
                        const option = document.createElement('option');
                        option.value = barangay.brgyDesc;
                        option.setAttribute('data-code', barangay.brgyCode);
                        barangayList.appendChild(option);
                        console.log('Debug5');
                    });

                    if (barangayInput && barangayInput.value ) {
                        const event = new Event('input', {bubbles: true});
                        barangayInput.dispatchEvent(event);
                    }
                }
            })
            .catch(error => console.error("Error fetching barangays:", error));
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