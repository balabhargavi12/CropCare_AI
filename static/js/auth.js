// Auth page functionality
document.addEventListener('DOMContentLoaded', function() {
    // Setup password validation listeners if we're on the register page
    const registerPassword = document.getElementById('register-password');
    const confirmPassword = document.getElementById('register-confirm-password');
    const passwordStrengthIndicator = document.getElementById('password-strength');
    const passwordMatchIndicator = document.getElementById('password-match');
    const registerBtn = document.getElementById('register-btn');
    
    if (registerPassword && confirmPassword) {
        registerPassword.addEventListener('input', validatePassword);
        confirmPassword.addEventListener('input', validatePasswordMatch);
    }
    
    // Check URL hash for direct registration tab
    if (window.location.hash === '#register') {
        showTab('register');
    }
});

function showTab(tabName) {
    // Update tab buttons for both old and new designs
    document.querySelectorAll('.tab-btn, .tab-pill').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`[onclick="showTab('${tabName}')"]`);
    if (activeBtn) activeBtn.classList.add('active');

    // Update form containers
    document.querySelectorAll('.form-container').forEach(form => {
        form.classList.remove('active');
    });
    document.getElementById(`${tabName}-form`).classList.add('active');
    
    // Update heading based on active tab
    const heading = document.getElementById('auth-heading');
    if (heading) {
        heading.textContent = tabName === 'register' ? 'Register' : 'Login';
    }

    // Update URL hash
    window.location.hash = tabName;
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

function validatePassword() {
    const password = document.getElementById('register-password').value;
    const strengthIndicator = document.getElementById('password-strength');
    const registerBtn = document.getElementById('register-btn');
    
    // Check password strength and requirements
    let strength = 0;
    const hasLen = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNum = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    strength += hasLen ? 1 : 0;
    strength += hasUpper ? 1 : 0;
    strength += hasNum ? 1 : 0;
    strength += hasSpecial ? 1 : 0;

    // Display requirements if not met
    const missing = [];
    if (!hasLen) missing.push('min 8 characters');
    if (!hasUpper) missing.push('one capital letter');
    if (!hasLower) missing.push('one lowercase letter');
    if (!hasSpecial) missing.push('one special character');
    if (!hasNum) missing.push('one number');

    if (strengthIndicator) {
        if (missing.length > 0) {
            strengthIndicator.textContent = `Password should contain ${missing.join(', ')}`;
            strengthIndicator.className = 'password-strength weak';
        } else {
            strengthIndicator.textContent = 'Password meets requirements';
            strengthIndicator.className = 'password-strength strong';
        }
    }

    // Update checklist UI
    updateRequirementsUI({ hasLen, hasUpper, hasLower, hasNum, hasSpecial });
    
    // Check both conditions before enabling register button
    validateFormCompletion();
}

function validatePasswordMatch() {
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const matchIndicator = document.getElementById('password-match');
    
    if (!confirmPassword) {
        matchIndicator.textContent = '';
        return;
    }
    
    if (password === confirmPassword) {
        matchIndicator.textContent = 'Passwords match';
        matchIndicator.className = 'password-match match';
    } else {
        matchIndicator.textContent = 'Passwords do not match';
        matchIndicator.className = 'password-match no-match';
    }
    
    // Check both conditions before enabling register button
    validateFormCompletion();
}

function validateFormCompletion() {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    const registerBtn = document.getElementById('register-btn');
    
    // Enable button only if all fields are filled, passwords match, and requirements met
    if (username && password && confirmPassword && password === confirmPassword && passwordMeetsRequirements(password)) {
        registerBtn.disabled = false;
    } else {
        registerBtn.disabled = true;
    }
}

function passwordMeetsRequirements(password) {
    return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

function updateRequirementsUI({ hasLen, hasUpper, hasLower, hasNum, hasSpecial }) {
    const map = [
        ['req-length', hasLen],
        ['req-upper', hasUpper],
        ['req-lower', hasLower],
        ['req-number', hasNum],
        ['req-special', hasSpecial],
    ];
    map.forEach(([id, ok]) => {
        const li = document.getElementById(id);
        if (!li) return;
        li.classList.toggle('valid', !!ok);
        const status = li.querySelector('.status');
        if (status) status.textContent = ok ? '✓' : '✗';
    });
}

async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (data.success) {
            window.location.href = '/dashboard';
        } else {
            showError('login-form', data.message || 'Login failed. Please check your credentials.');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('login-form', 'An error occurred during login. Please try again.');
    }
}

async function handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;
    
    // Double check passwords match
    if (password !== confirmPassword) {
        showError('register-form', 'Passwords do not match.');
        return;
    }

    // Ensure requirements are met
    if (!passwordMeetsRequirements(password)) {
        showError('register-form', 'Password should contain min 8 characters, one capital letter, one special character, and one number.');
        return;
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (data.success) {
            // Show success message briefly then redirect
            showSuccess('Registration successful! Redirecting to dashboard...');
            setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
        } else {
            showError('register-form', data.message || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('register-form', 'An error occurred during registration');
    }
}

function showError(formId, message) {
    // Remove any existing error messages
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Create and show new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const form = document.getElementById(formId);
    form.querySelector('button').insertAdjacentElement('beforebegin', errorDiv);
}

function showSuccess(message) {
    // Remove any existing messages
    const existingMessage = document.querySelector('.success-message');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Create and show success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    const card = document.querySelector('.auth-card') || document.body;
    card.prepend(successDiv);
}
