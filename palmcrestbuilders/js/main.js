// Palm Crest Builders — main.js
document.addEventListener('DOMContentLoaded', function() {
    // Mobile nav toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });
        document.addEventListener('click', function(e) {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            }
        });
        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                navToggle.classList.remove('active');
            });
        });
    }

    // FAQ accordion
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        if (question) {
            question.addEventListener('click', () => {
                faqItems.forEach(other => { if (other !== item) other.classList.remove('active'); });
                item.classList.toggle('active');
            });
        }
    });

    // Contact form validation
    const contactForm = document.querySelector('.contact-form form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            const name = this.querySelector('input[name="name"]');
            const email = this.querySelector('input[name="email"]');
            const phone = this.querySelector('input[name="phone"]');
            const captcha = this.querySelector('input[name="captcha"]');
            let isValid = true;

            this.querySelectorAll('input, textarea').forEach(input => {
                input.style.borderColor = '';
            });

            if (name && !name.value.trim()) { name.style.borderColor = '#c9302c'; isValid = false; }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email && !emailRegex.test(email.value)) { email.style.borderColor = '#c9302c'; isValid = false; }
            if (phone && !phone.value.trim()) { phone.style.borderColor = '#c9302c'; isValid = false; }

            if (captcha) {
                const answer = captcha.getAttribute('data-answer');
                if (captcha.value !== answer) {
                    captcha.style.borderColor = '#c9302c';
                    isValid = false;
                    alert('Please answer the math question correctly.');
                    e.preventDefault();
                    return;
                }
            }
            if (!isValid) e.preventDefault();
        });
    }

    // Smooth scroll for hash links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    // Captcha generation
    document.querySelectorAll('input[name="captcha"]').forEach(input => {
        const n1 = Math.floor(Math.random() * 10) + 1;
        const n2 = Math.floor(Math.random() * 10) + 1;
        const label = input.parentElement.querySelector('.captcha-question');
        if (label) label.textContent = `${n1} + ${n2} = `;
        input.setAttribute('data-answer', String(n1 + n2));
    });

    // Lead source attribution - append source_domain + landing_page + referrer to every form
    document.querySelectorAll('form').forEach(function(f) {
        const fields = {
            source_domain: window.location.hostname,
            landing_page: window.location.pathname,
            referrer: document.referrer || 'direct'
        };
        Object.keys(fields).forEach(function(key) {
            if (!f.querySelector('input[name="' + key + '"]')) {
                const h = document.createElement('input');
                h.type = 'hidden';
                h.name = key;
                h.value = fields[key];
                f.appendChild(h);
            }
        });
    });
});
