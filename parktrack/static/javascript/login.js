const form = document.getElementById('login-form');

form.addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(form);

    try {
        const response = await fetch(form.action, {
            method: 'POST',
            body: formData,
            headers: {
                'X-CSRFToken': getCookie('csrftoken'),
                'X-Requested-With': 'XMLHttpRequest'
            }
        });

        const data = await response.json();
        
        if (data.success) {
            clearErrors();
            console.log(data.redirect_url);
            window.location.href = data.redirect_url;
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

function getCookie(name) {
    const value = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return value ? decodeURIComponent(value.split('=')[1]) : null;
}

function clearErrors() {
    form.querySelectorAll('.text-red-500').forEach(element => element.remove());
}