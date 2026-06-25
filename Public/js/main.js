let activeFleetData = []; 

function getRoleKey() {
    if (document.getElementById('statTotalCars') || document.getElementById('statRev') || document.getElementById('inventoryBody') || document.getElementById('bookingsBody') || document.getElementById('topVehicleChart') || window.location.pathname.includes('admin')) {
        return 'admin';
    }
    return 'customer';
}

const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function toggleAuth(view) {
    const loginSection = document.getElementById('loginSection');
    const signupSection = document.getElementById('signupSection');
    const errorDiv = document.getElementById('errorMessage');
    
    if (loginSection && signupSection) {
        loginSection.classList.toggle('hidden', view === 'signup');
        signupSection.classList.toggle('hidden', view === 'login');
    }
    if (errorDiv) errorDiv.classList.add('hidden');
}

function switchRole(role) {
    const custTab = document.getElementById('custTab');
    const adminTab = document.getElementById('adminTab');
    const roleInput = document.getElementById('userRole');
    const submitBtn = document.getElementById('loginBtn');

    if (roleInput) roleInput.value = role;

    if (role === 'customer') {
        custTab.className = "tab-btn flex-1 py-2 text-sm font-semibold rounded-lg bg-white shadow-sm text-blue-600";
        adminTab.className = "tab-btn flex-1 py-2 text-sm font-semibold rounded-lg text-gray-500";
        if (submitBtn) submitBtn.innerText = 'Sign In';
    } else {
        adminTab.className = "tab-btn flex-1 py-2 text-sm font-semibold rounded-lg bg-white shadow-sm text-blue-600";
        custTab.className = "tab-btn flex-1 py-2 text-sm font-semibold rounded-lg text-gray-500";
        if (submitBtn) submitBtn.innerText = 'Admin Portal Access';
    }
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const role = document.getElementById('userRole') ? document.getElementById('userRole').value : 'customer';

    if (role !== 'admin' && !validateEmail(email)) return alert("Please enter a valid email.");
    await handleRequest('/api/auth/login', { email, password, role });
}

async function handleSignup(event) {
    event.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const verificationId = document.getElementById('signupVerificationId').value;
    const errorDiv = document.getElementById('errorMessage');

    if (!verificationId || verificationId.trim().length < 6) {
        errorDiv.innerText = "Registration Denied: Please provide a valid Verification ID (minimum 6 characters).";
        errorDiv.classList.remove('hidden');
        return; 
    }

    if (!validateEmail(email)) {
        errorDiv.innerText = "Please enter a valid email.";
        errorDiv.classList.remove('hidden');
        return;
    }

    await handleRequest('/api/auth/signup', { name, email, password, role: 'customer', verification_id: verificationId });
}

async function handleRequest(url, body) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) errorDiv.classList.add('hidden');

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        
        if (res.ok) {
            if (url.includes('signup')) {
                alert("Account created successfully! Please log in.");
                toggleAuth('login');
            } else {
                const roleKey = data.user.role === 'admin' ? 'admin' : 'customer';
                sessionStorage.setItem(`${roleKey}_token`, data.token);
                sessionStorage.setItem(`${roleKey}_user`, JSON.stringify(data.user));
                window.location.href = data.redirectUrl || 'discovery.html';
            }
        } else {
            if (errorDiv) {
                errorDiv.innerText = data.message || "Action failed";
                errorDiv.classList.remove('hidden');
            } else { alert(data.message || "Action failed"); }
        }
    } catch (err) { alert("Server connection failed. Make sure your server is running."); }
}

function toggleProfileDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.toggle('hidden');
}

function openProfileModal() {
    const roleKey = getRoleKey();
    const userDataStr = sessionStorage.getItem(`${roleKey}_user`);
    const dropdown = document.getElementById('profileDropdown');
    
    if (dropdown) dropdown.classList.add('hidden');
    if (!userDataStr) return alert("Session profile data is missing. Please log in again.");

    try {
        const user = JSON.parse(userDataStr);
        document.getElementById('customerAvatar').innerText = user.name ? user.name.charAt(0) : 'U';
        document.getElementById('profileCardName').innerText = user.name || 'Anonymous User';
        document.getElementById('profileCardRole').innerText = user.role || 'Customer';
        document.getElementById('profileDetailName').innerText = user.name || 'N/A';
        document.getElementById('profileDetailEmail').innerText = user.email || 'No email attached';
        
        let vId = user.verification_id;
        if (!vId || vId.trim() === '' || vId === 'Not Provided' || vId === 'null') { vId = 'N/A'; }
        
        const verifyEl = document.getElementById('profileDetailVerification');
        if (verifyEl) verifyEl.innerText = vId;
        document.getElementById('profileDetailId').innerText = `#VD-00${user.id || '0'}`;
        
        const modal = document.getElementById('customerProfileModal');
        if (modal) modal.classList.remove('hidden');
    } catch (err) { console.error("Failed to map account parameters:", err); }
}

function togglePasswordEdit() {
    const editSection = document.getElementById('passwordEditSection');
    if (editSection) editSection.classList.toggle('hidden');
}

function closeProfileModal() {
    const modal = document.getElementById('customerProfileModal');
    if (modal) modal.classList.add('hidden');
}

async function executeLogout() {
    const roleKey = getRoleKey();
    const token = sessionStorage.getItem(`${roleKey}_token`);
    if (token) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
            });
        } catch (err) { console.error("Logout ping failed", err); }
    }
    sessionStorage.removeItem(`${roleKey}_token`);
    sessionStorage.removeItem(`${roleKey}_user`);
    window.location.href = 'login.html';
}

async function changePassword() {
    const newPassword = document.getElementById('newPasswordInput').value;
    if (!newPassword || newPassword.length < 6) return alert("Password must be at least 6 characters long.");

    const roleKey = getRoleKey();
    const token = sessionStorage.getItem(`${roleKey}_token`);
    try {
        const res = await fetch('/api/auth/update-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ newPassword })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert("✅ " + data.message);
            document.getElementById('newPasswordInput').value = '';
        } else { alert("Error: " + data.message); }
    } catch(err) { alert("Server connection encountered an error."); }
}

window.addEventListener('click', () => {
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.add('hidden');
});

async function loadFleet() {
    const grid = document.getElementById('fleetGrid');
    if (!grid) return;
    try {
        const res = await fetch('/api/vehicles/fleet');
        const cars = await res.json();
        activeFleetData = cars;
        renderFleetGrid(activeFleetData);
    } catch (err) { grid.innerHTML = `<p class="text-red-500 py-10">Failed to load vehicles.</p>`; }
}

function renderFleetGrid(cars) {
    const grid = document.getElementById('fleetGrid');
    if (!grid) return;
    if (cars.length === 0) {
        grid.innerHTML = `<p class="col-span-full text-center text-gray-500 py-10 text-xl font-medium">No vehicles matching your search criteria.</p>`;
        return;
    }
    grid.innerHTML = cars.map(car => {
        let currentStatus = (car.status || '').toLowerCase();
        let quantityAvailable = car.quantity;
        if (quantityAvailable === null || quantityAvailable === undefined || quantityAvailable === '') {
            quantityAvailable = 1;
        } else {
            quantityAvailable = parseInt(quantityAvailable);
        }

        if (quantityAvailable <= 0) currentStatus = 'out of stock';

        const isAvailable = currentStatus === 'available' && quantityAvailable > 0;
        const rangeText = car.battery_range ? `${car.battery_range} Range` : '';
        
        let statusText = currentStatus.toUpperCase();
        let alertMsg = 'Vehicle is unavailable.';

        if (!isAvailable) {
            if (currentStatus === 'out of stock') alertMsg = 'No available units remaining in stock.';
            else if (currentStatus === 'rented') alertMsg = 'It is currently rented.';
            else if (currentStatus === 'maintenance') alertMsg = 'It is under maintenance.';
        }

        const statusBadge = !isAvailable ? `<div class="absolute top-5 left-5 bg-red-100 text-red-700 text-xs font-black px-3 py-1.5 rounded-lg">${statusText}</div>` : '';
        const btnAction = isAvailable ? `selectCar(${car.id}, ${car.price_per_day})` : `alert('${alertMsg}')`;

        return `
        <div class="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col h-full relative">
            ${statusBadge}
            <img src="${car.image_url || 'https://via.placeholder.com/400x250'}" class="rounded-2xl mb-4 w-full h-44 object-cover bg-gray-50 ${!isAvailable ? 'opacity-50 grayscale-[50%]' : ''}">
            <div class="flex-1">
                <h3 class="text-xl font-bold">${car.name}</h3>
                <p class="text-gray-500 text-sm mt-1">${car.type} • ${quantityAvailable > 0 ? quantityAvailable + ' units left' : '0 units'} ${rangeText ? '• ' + rangeText : ''}</p>
            </div>
            <div class="flex justify-between items-center mt-6 pt-4 border-t border-gray-50">
                <span class="text-2xl font-bold">₹${car.price_per_day}<span class="text-sm text-gray-400 font-medium">/day</span></span>
                <button onclick="${btnAction}" class="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 ${!isAvailable ? 'opacity-50 cursor-not-allowed' : ''}">Book</button>
            </div>
        </div>
        `;
    }).join('');
}

function filterFleet() {
    const searchInput = document.getElementById('searchBar');
    const typeSelect = document.getElementById('typeFilter');
    const sortSelect = document.getElementById('sortFilter');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';
    const typeQuery = typeSelect ? typeSelect.value : 'All';
    const sortQuery = sortSelect ? sortSelect.value : 'default';

    let filtered = activeFleetData.filter(car => {
        const matchesSearch = car.name.toLowerCase().includes(searchQuery);
        const matchesType = typeQuery === 'All' || car.type === typeQuery;
        return matchesSearch && matchesType;
    });

    if (sortQuery === 'priceLow') filtered.sort((a, b) => parseFloat(a.price_per_day) - parseFloat(b.price_per_day));
    else if (sortQuery === 'priceHigh') filtered.sort((a, b) => parseFloat(b.price_per_day) - parseFloat(a.price_per_day));

    renderFleetGrid(filtered);
}

function selectCar(id, price) {
    sessionStorage.setItem('selectedVehicleId', id);
    sessionStorage.setItem('selectedVehiclePrice', price);
    window.location.href = 'checkout.html';
}

function initCheckout() {
    const vId = sessionStorage.getItem('selectedVehicleId');
    const vPrice = parseFloat(sessionStorage.getItem('selectedVehiclePrice')) || 0;

    if (!vId) { window.location.href = 'discovery.html'; return; }
    document.getElementById('checkoutVehId').value = `#VD-VEH-${vId}`;
    
    const pDate = document.getElementById('pickupDate');
    const rDate = document.getElementById('returnDate');
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    pDate.value = today.toISOString().split('T')[0];
    pDate.min = today.toISOString().split('T')[0];
    rDate.value = tomorrow.toISOString().split('T')[0];
    rDate.min = tomorrow.toISOString().split('T')[0];

    const roleKey = getRoleKey();
    const userStr = sessionStorage.getItem(`${roleKey}_user`);
    if(userStr) document.getElementById('driverName').value = JSON.parse(userStr).name;

    function calculateTotals() {
        const start = new Date(pDate.value);
        const end = new Date(rDate.value);
        let days = (end - start) / (1000 * 60 * 60 * 24);
        if (days < 1) days = 1; 

        const subtotal = vPrice * days;
        const tax = subtotal * 0.18; 
        const total = subtotal + tax;

        document.getElementById('summaryDaily').innerText = `₹${vPrice.toFixed(2)}`;
        document.getElementById('summaryDays').innerText = `${days} Day(s)`;
        document.getElementById('summaryTax').innerText = `₹${tax.toFixed(2)}`;
        document.getElementById('summaryTotal').innerText = `₹${total.toFixed(2)}`;
        sessionStorage.setItem('calculatedTotal', total.toFixed(2));
    }

    pDate.addEventListener('change', calculateTotals);
    rDate.addEventListener('change', calculateTotals);
    calculateTotals();
}

async function confirmBooking(event) {
    if(event) event.preventDefault();

    const roleKey = getRoleKey();
    const vehicleId = sessionStorage.getItem('selectedVehicleId');
    const userStr = sessionStorage.getItem(`${roleKey}_user`);
    const token = sessionStorage.getItem(`${roleKey}_token`);

    if (!vehicleId || !userStr) return alert("Session expired. Please log in again.");
    const user = JSON.parse(userStr);

    const startDate = document.getElementById('pickupDate').value;
    const endDate = document.getElementById('returnDate').value;
    const pickupLoc = document.getElementById('pickupLocation').value;
    const driverName = document.getElementById('driverName').value;
    const finalTotal = sessionStorage.getItem('calculatedTotal');

    if(!startDate || !endDate || !pickupLoc || !driverName) return alert("Please fill in all reservation details.");

    const bookingData = {
        user_id: user.id,
        vehicle_id: vehicleId,
        start_date: startDate,
        end_date: endDate,
        total_price: finalTotal,
        pickup_location: pickupLoc,
        driver_name: driverName
    };

    const btn = document.getElementById('confirmBtn');
    if(btn) { btn.innerText = "Processing Vault..."; btn.disabled = true; }

    try {
        const res = await fetch('/api/bookings/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(bookingData)
        });

        if (res.ok) {
            alert("✅ Booking Request submitted successfully! Awaiting Admin Approval.");
            window.location.href = 'my-Booking.html'; 
        } else {
            const data = await res.json();
            alert("Booking failed: " + (data.message || "Please check your details."));
        }
    } catch(err) {
        alert("Server connection failed.");
    } finally {
        if(btn) { btn.innerText = "Confirm & Pay"; btn.disabled = false; }
    }
}

// ==========================================
// ENTERPRISE FEATURES: BOOKINGS, TIMELINE, PDF & QR
// ==========================================

function formatDate12Hour(dateString) {
    const date = new Date(dateString);
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${date.toLocaleDateString()} at ${hours}:${minutes} ${ampm}`;
}

function getTimelineHTML(startDate, endDate, status) {
    const today = new Date();
    today.setHours(0,0,0,0);
    const start = new Date(startDate);
    start.setHours(0,0,0,0);
    const end = new Date(endDate);
    end.setHours(0,0,0,0);

    let step = 1; 
    if (today.getTime() === start.getTime()) step = 2;
    else if (today > start && today <= end) step = 3;
    else if (today > end) step = 4;

    return `
        <div class="w-full mt-4 mb-2">
            <div class="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
                <span class="${step >= 1 ? 'text-blue-600' : ''}">Reserved</span>
                <span class="${step >= 2 ? 'text-blue-600' : ''}">Pick-up</span>
                <span class="${step >= 3 ? 'text-blue-600' : ''}">Active</span>
                <span class="${step >= 4 ? 'text-blue-600' : ''}">Complete</span>
            </div>
            <div class="flex h-2 bg-gray-100 rounded-full overflow-hidden">
                <div class="bg-blue-600 transition-all duration-1000 ease-out" style="width: ${step === 1 ? '25%' : step === 2 ? '50%' : step === 3 ? '75%' : '100%'}"></div>
            </div>
        </div>
    `;
}

async function loadMyBookings() {
    const tbody = document.getElementById('myBookingsTableBody');
    if (!tbody) return;

    const token = sessionStorage.getItem('customer_token');
    
    try {
        const res = await fetch('/api/bookings/me', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) { executeLogout(); return; }
            throw new Error("Server Error");
        }
        const bookings = await res.json();
        if (!Array.isArray(bookings)) throw new Error("Invalid data format received.");

        let totalSpent = bookings.filter(b => b.status !== 'Rejected').reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
        
        const pointsEl = document.getElementById('voltPointsDisplay');
        if (pointsEl) pointsEl.innerText = Math.floor(totalSpent).toLocaleString();

        const activeBookings = bookings.filter(b => {
            const today = new Date();
            today.setHours(0,0,0,0);
            const endDateObj = new Date(b.end_date);
            endDateObj.setHours(0,0,0,0);
            return endDateObj.getTime() >= today.getTime(); 
        });

        if (activeBookings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-gray-500 font-medium">You have no active reservations.</td></tr>`;
            return;
        }

        tbody.innerHTML = activeBookings.map(b => {
            const startStr = formatDate12Hour(b.start_date);
            const endStr = formatDate12Hour(b.end_date);
            const timelineHtml = getTimelineHTML(b.start_date, b.end_date, b.status);
            
            const today = new Date();
            today.setHours(0,0,0,0);
            const startDate = new Date(b.start_date);
            startDate.setHours(0,0,0,0);
            
            let actionButtons = '';
            
            if (today.getTime() < startDate.getTime()) {
                actionButtons += `<button onclick="openCancelModal(${b.id})" class="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">Cancel</button>`;
            }

            if (b.status === 'Approved') {
                if (today.getTime() === startDate.getTime()) {
                    actionButtons += `<button onclick="showDigitalKey(${b.id}, '${b.vehicle_name}')" class="px-3 py-2 text-xs font-bold text-white bg-gray-900 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">key</span> Unlock</button>`;
                }
                actionButtons += `<button onclick="downloadReceipt(${b.id}, '${b.vehicle_name}', '${parseFloat(b.total_price || 0).toFixed(2)}', '${startStr}', '${endStr}')" class="px-3 py-2 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">download</span> Receipt</button>`;
            } else if (b.status === 'Rejected') {
                actionButtons += `<span class="text-xs font-bold text-red-500">Booking Denied</span>`;
            } else {
                actionButtons += `<span class="text-xs font-bold text-orange-500 flex items-center"><span class="material-symbols-outlined text-[16px] mr-1">hourglass_empty</span> Pending Approval</span>`;
            }

            let statusBadge = '';
            if (b.status === 'Pending') statusBadge = '<span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 w-fit">Pending</span>';
            else if (b.status === 'Approved') statusBadge = '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 w-fit">Approved</span>';
            else if (b.status === 'Rejected') statusBadge = '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase mt-1 w-fit">Rejected</span>';

            return `
                <tr class="hover:bg-gray-50 transition-colors bg-white">
                    <td class="p-5 w-2/5">
                        <div class="flex flex-col gap-2">
                            <div class="flex items-center gap-4">
                                <img src="${b.image_url || 'https://via.placeholder.com/200x120'}" class="w-16 h-10 rounded-lg object-cover border border-gray-200">
                                <div class="flex flex-col">
                                    <div class="font-bold text-gray-900">${b.vehicle_name}</div>
                                    <div class="text-xs text-gray-400">Booking #${b.id}</div>
                                    ${statusBadge}
                                </div>
                            </div>
                            ${timelineHtml}
                        </div>
                    </td>
                    <td class="p-5">
                        <div class="text-sm font-semibold text-gray-700">${startStr}</div>
                        <div class="text-xs text-gray-400 mt-1">until ${endStr}</div>
                    </td>
                    <td class="p-5 text-sm font-bold text-blue-600">
                        ₹${parseFloat(b.total_price || 0).toFixed(2)}
                    </td>
                    <td class="p-5 text-right space-x-2 flex justify-end items-center h-full pt-8">
                        ${actionButtons}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) { 
        console.error("Booking load error:", err);
        tbody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-red-500 font-bold">Error: ${err.message}. Check database connection.</td></tr>`; 
    }
}

function showDigitalKey(bookingId, vehicleName) {
    document.getElementById('qrModal').classList.remove('hidden');
    document.getElementById('qrVehicleName').innerText = vehicleName;
    const qrcodeContainer = document.getElementById("qrcode");
    qrcodeContainer.innerHTML = ""; 
    new QRCode(qrcodeContainer, {
        text: `VD-KEY-BK-${bookingId}-${Date.now()}`,
        width: 180, height: 180, colorDark : "#0f172a", colorLight : "#f8fafc",
    });
}

function downloadReceipt(bookingId, vehicleName, price, start, end) {
    const user = JSON.parse(sessionStorage.getItem('customer_user'));
    const receipt = document.createElement('div');
    receipt.innerHTML = `
        <div style="padding: 40px; font-family: Helvetica, Arial, sans-serif; color: #111827; max-width: 600px;">
            <h1 style="color: #2563eb; font-size: 32px; margin-bottom: 5px;">VoltDrive</h1>
            <p style="color: #6b7280; font-size: 14px; margin-top: 0;">Official Rental Invoice</p>
            <hr style="border: 0; border-top: 2px solid #e5e7eb; margin: 25px 0;">
            <p style="font-size: 14px; margin: 0;"><strong>Billed To:</strong> ${user.name} (${user.email})</p>
            <p style="font-size: 14px; margin: 5px 0;"><strong>Booking ID:</strong> #BK-${bookingId}</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 25px 0;">
            <h2 style="font-size: 20px; margin-bottom: 15px;">Vehicle Details</h2>
            <p style="margin: 5px 0;"><strong>Vehicle:</strong> ${vehicleName}</p>
            <p style="margin: 5px 0;"><strong>Pick-up:</strong> ${start}</p>
            <p style="margin: 5px 0;"><strong>Return:</strong> ${end}</p>
            <hr style="border: 0; border-top: 2px solid #e5e7eb; margin: 25px 0;">
            <h3 style="font-size: 28px; color: #111827; text-align: right;">Total Paid: ₹${price}</h3>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 50px; text-align: center;">Thank you for driving with VoltDrive.</p>
        </div>
    `;
    const opt = { margin: 1, filename: `VoltDrive_Receipt_BK${bookingId}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
    html2pdf().set(opt).from(receipt).save();
}

let bookingToCancel = null;
function openCancelModal(id) {
    bookingToCancel = id;
    document.getElementById('cancelModal').classList.remove('hidden');
}

function closeModals() {
    const cm = document.getElementById('cancelModal');
    const qm = document.getElementById('qrModal');
    if(cm) cm.classList.add('hidden');
    if(qm) qm.classList.add('hidden');
    bookingToCancel = null;
}

async function executeCancelBooking() {
    if (!bookingToCancel) return;
    const token = sessionStorage.getItem('customer_token');
    try {
        const res = await fetch(`/api/bookings/me/${bookingToCancel}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok) {
            alert("✅ Booking cancelled successfully.");
            closeModals();
            loadMyBookings(); 
        } else { alert("Error: " + data.message); }
    } catch (err) { alert("Server connection failed."); }
}

async function loadDashboard() {
    const dashboardActive = document.getElementById('statRev') || document.getElementById('statTotalCars');
    if (!dashboardActive) return;

    const token = sessionStorage.getItem('admin_token');
    try {
        const res = await fetch('/api/bookings/stats', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const stats = await res.json();

        if (res.ok) {
            const revEl = document.getElementById('statRev');
            if (revEl) revEl.innerText = `₹${stats.totalRevenue}`;

            const activeEl = document.getElementById('statActive');
            if (activeEl) activeEl.innerText = stats.activeRentals;

            const maintEl = document.getElementById('statMaint');
            if (maintEl) maintEl.innerText = stats.pendingMaintenance;
            
            const availEl = document.getElementById('statAvail');
            if (availEl) availEl.innerText = stats.availableVehicles;

            const totalCarsEl = document.getElementById('statTotalCars');
            if (totalCarsEl) {
                const totalCount = (parseInt(stats.activeRentals) || 0) + (parseInt(stats.pendingMaintenance) || 0) + (parseInt(stats.availableVehicles) || 0);
                totalCarsEl.innerText = totalCount;
            }
        }
    } catch (err) {
        console.error("Dashboard stats error:", err);
    }
}

async function loadInventory() {
    const tbody = document.getElementById('inventoryBody');
    if (!tbody) return;

    try {
        const res = await fetch('/api/vehicles/fleet');
        const cars = await res.json();

        if (cars.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500 font-medium">No vehicles registered in your system yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = cars.map(car => {
            const rangeText = car.battery_range ? `${car.battery_range} Range` : 'N/A';
            let quantityAvailable = car.quantity;
            if (quantityAvailable === null || quantityAvailable === undefined || quantityAvailable === '') quantityAvailable = 1;
            else quantityAvailable = parseInt(quantityAvailable);

            let currentStatus = (car.status || '').toLowerCase();
            if (quantityAvailable <= 0) currentStatus = 'out of stock';

            return `
                <tr class="hover:bg-gray-50/50 transition-colors border-b border-gray-100">
                    <td class="p-4">
                        <div class="flex items-center gap-3">
                            <img src="${car.image_url || 'https://via.placeholder.com/400x250'}" class="w-12 h-8 rounded-lg object-cover border" alt="">
                            <div>
                                <div class="font-bold text-gray-900">${car.name}</div>
                                <div class="text-xs text-gray-400">${rangeText}</div>
                            </div>
                        </div>
                    </td>
                    <td class="p-4 text-sm font-medium text-gray-500">${car.type}</td>
                    
                    <td class="p-4">
                        <select id="status-${car.id}" onchange="updateVehicleInventory(${car.id})" class="text-xs font-bold uppercase rounded-lg border-gray-200 py-1.5 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer shadow-sm">
                            <option value="available" ${currentStatus === 'available' ? 'selected' : ''}>Available</option>
                            <option value="rented" ${currentStatus === 'rented' ? 'selected' : ''}>Active Rental</option>
                            <option value="maintenance" ${currentStatus === 'maintenance' ? 'selected' : ''}>On Maintenance</option>
                            <option value="out of stock" ${currentStatus === 'out of stock' ? 'selected' : ''}>Out of Stock</option>
                        </select>
                    </td>

                    <td class="p-4">
                        <input type="number" id="qty-${car.id}" value="${quantityAvailable}" onchange="updateVehicleInventory(${car.id})" class="w-20 p-2 border rounded-lg text-sm font-bold shadow-sm">
                    </td>
                    
                    <td class="p-4">
                        <div class="flex items-center justify-between gap-4">
                            <span class="text-sm font-bold text-blue-600">₹${car.price_per_day}/day</span>
                            <button onclick="deleteVehicle(${car.id})" class="inline-flex items-center justify-center p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all font-bold text-sm">
                                <span class="material-symbols-outlined text-lg mr-1">delete</span>
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error("Error loading inventory table:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500">Failed to pull real-time database fleet information.</td></tr>`;
    }
}

async function updateVehicleInventory(id) {
    const token = sessionStorage.getItem('admin_token');
    const newStatus = document.getElementById(`status-${id}`).value;
    const newQty = document.getElementById(`qty-${id}`).value;

    try {
        const res = await fetch(`/api/vehicles/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: newStatus, quantity: newQty })
        });
        
        if (!res.ok) throw new Error();
        alert("✅ Inventory Updated");
        loadInventory(); 
    } catch (err) { alert("Failed to modify system properties."); }
}

async function loadAdminBookings() {
    const tbody = document.getElementById('bookingsBody');
    if (!tbody) return;

    const token = sessionStorage.getItem('admin_token');
    try {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500 font-medium animate-pulse">Loading booking records...</td></tr>`;

        const res = await fetch('/api/bookings/all', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) { executeLogout(); return; }
            throw new Error((await res.json()).message || "Server Error");
        }

        const bookings = await res.json();
        if (!Array.isArray(bookings)) throw new Error("Invalid data format received.");
        if (bookings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-gray-500 font-medium">No customer bookings found in the database.</td></tr>`;
            return;
        }

        tbody.innerHTML = bookings.map(b => {
            const start = b.start_date ? new Date(b.start_date).toLocaleDateString() : 'N/A';
            const end = b.end_date ? new Date(b.end_date).toLocaleDateString() : 'N/A';
            const loc = b.pickup_location || 'Main Hub';
            const driver = b.driver_name || 'Self';
            
            // Safely parse dates using .getTime() to avoid timezone/string issues
            const today = new Date();
            today.setHours(0,0,0,0);
            const endDateObj = new Date(b.end_date);
            endDateObj.setHours(0,0,0,0);
            const isPast = endDateObj.getTime() < today.getTime();

            let statusBadge = '';
            let actionButtons = '';
            
            if (b.status === 'Rejected') {
                statusBadge = '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2">Rejected</span>';
            } else if (isPast) {
                // If ride is over, instantly mark it completed and show ZERO buttons
                statusBadge = '<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2">Completed</span>';
            } else if (b.status === 'Pending') {
                statusBadge = '<span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2">Pending</span>';
                actionButtons = `
                    <div class="flex gap-2 mt-3">
                        <button onclick="approveBooking(${b.id}, ${b.vehicle_id})" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors shadow-sm">Approve</button>
                        <button onclick="rejectBooking(${b.id})" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition-colors shadow-sm">Reject</button>
                    </div>
                `;
            } else if (b.status === 'Approved') {
                statusBadge = '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase ml-2">Approved</span>';
            }

            return `
                <tr class="hover:bg-gray-50/50 transition-colors border-b border-gray-100 text-sm">
                    <td class="p-4">
                        <div class="font-bold text-gray-900 flex items-center">#BK-${b.id} ${statusBadge}</div>
                    </td>
                    <td class="p-4">
                        <div class="font-medium text-gray-900">${b.customer_name || b.user_id || 'Unknown User'}</div>
                        <div class="text-xs text-gray-400">${b.customer_email || ''}</div>
                    </td>
                    <td class="p-4 text-gray-600 font-medium">${b.vehicle_name || 'Vehicle ID: ' + b.vehicle_id}</td>
                    <td class="p-4 text-gray-500 font-medium">
                        <div>${start} to ${end}</div>
                        <div class="text-xs text-blue-500 mt-1">Loc: ${loc}</div>
                        <div class="text-xs text-gray-400">Driver: ${driver}</div>
                    </td>
                    <td class="p-4">
                        <span class="text-sm font-bold text-blue-600">₹${parseFloat(b.total_price || 0).toFixed(2)}</span>
                        ${actionButtons}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Error loading admin bookings:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500 font-bold">Error: ${err.message}. Check database connection.</td></tr>`;
    }
}

async function approveBooking(bookingId, vehicleId) {
    if (!confirm("Approve this booking and deduct vehicle from stock?")) return;
    const token = sessionStorage.getItem('admin_token');
    try {
        const res = await fetch(`/api/bookings/${bookingId}/approve`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ vehicle_id: vehicleId })
        });
        if (res.ok) {
            alert("✅ Booking Approved successfully.");
            loadAdminBookings();
        } else alert("Error approving booking.");
    } catch (err) { alert("Server error."); }
}

async function rejectBooking(bookingId) {
    if (!confirm("Are you sure you want to reject this booking?")) return;
    const token = sessionStorage.getItem('admin_token');
    try {
        const res = await fetch(`/api/bookings/${bookingId}/reject`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert("Booking Rejected.");
            loadAdminBookings();
        } else alert("Error rejecting booking.");
    } catch (err) { alert("Server error."); }
}

async function deleteVehicle(id) {
    if (!confirm("Are you completely sure you want to delete this vehicle from your fleet?")) return;
    const token = sessionStorage.getItem('admin_token');
    try {
        const res = await fetch(`/api/vehicles/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) loadInventory();
        else alert("Error deleting vehicle asset: " + (data.message || data.error || "Unknown server error."));
    } catch (err) { alert("Server connection failed during deletion."); }
}

function toggleBatteryRange() {
    const typeSelect = document.getElementById('vehType');
    const rangeContainer = document.getElementById('batteryRangeContainer');
    const rangeInput = document.getElementById('vehRange');
    
    if (!typeSelect || !rangeContainer) return;

    if (typeSelect.value === 'Electric Car') {
        rangeContainer.classList.remove('hidden');
        rangeInput.required = true;
    } else {
        rangeContainer.classList.add('hidden');
        rangeInput.required = false;
        rangeInput.value = ''; 
    }
}

async function handleAddVehicle(event) {
    event.preventDefault();
    const name = document.getElementById('vehName').value;
    const type = document.getElementById('vehType').value;
    const battery_range = document.getElementById('vehRange') ? document.getElementById('vehRange').value : '';
    const price_per_day = document.getElementById('vehPrice').value;
    const image_url = document.getElementById('vehImage').value;
    const status = document.getElementById('vehStatus').value;

    const token = sessionStorage.getItem('admin_token');
    const submitBtn = document.getElementById('addVehBtn');
    submitBtn.innerText = 'Adding...';
    submitBtn.disabled = true;

    try {
        const res = await fetch('/api/vehicles/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ name, type, battery_range, price_per_day, image_url, status, quantity: 1 })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            alert("✅ " + data.message);
            document.getElementById('addVehicleForm').reset();
            toggleBatteryRange(); 
            loadInventory();
        } else alert("Error: " + data.message);
    } catch (err) { alert("Failed to connect to the server."); } 
    finally { submitBtn.innerText = 'Add Vehicle'; submitBtn.disabled = false; }
}

async function loadReports() {
    const token = sessionStorage.getItem('admin_token');
    try {
        const res = await fetch('/api/reports/data', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();

        document.getElementById('repTotalRevenue').innerText = `₹${parseFloat(data.totalRevenue).toLocaleString()}`;
        document.getElementById('repTotalBookings').innerText = data.totalBookings;
        document.getElementById('repActiveVehicles').innerText = data.activeVehicles;

        const colors = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

        const topCtx = document.getElementById('topVehicleChart');
        if (topCtx && data.topVehicles) {
            new Chart(topCtx, {
                type: 'doughnut',
                data: {
                    labels: data.topVehicles.map(v => v.name),
                    datasets: [{ data: data.topVehicles.map(v => v.rent_count), backgroundColor: colors, borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
            });
        }

        let evCount = 0; let twoCount = 0; let fourCount = 0;
        if(data.vehicleTypes) {
            data.vehicleTypes.forEach(t => {
                const typeName = t.type.toLowerCase();
                if (typeName.includes('electric') || typeName.includes('ev')) evCount += t.rent_count;
                else if (typeName.includes('bike') || typeName.includes('scooter') || typeName.includes('two')) twoCount += t.rent_count;
                else fourCount += t.rent_count; 
            });
        }

        const typeCtx = document.getElementById('typeOverviewChart');
        if (typeCtx) {
            new Chart(typeCtx, {
                type: 'bar',
                data: {
                    labels: ['Electric Vehicles', 'Two-Wheelers', 'Four-Wheelers'],
                    datasets: [{ label: 'Total Rentals', data: [evCount, twoCount, fourCount], backgroundColor: ['#10b981', '#ef4444', '#f59e0b'], borderRadius: 6 }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
            });
        }
    } catch (err) { console.error("Error loading reports:", err); }
}

async function submitContactForm(event) {
    if (event) event.preventDefault();
    const name = document.getElementById('contactName').value;
    const email = document.getElementById('contactEmail').value;
    const message = document.getElementById('contactMessage').value;

    const btn = document.getElementById('contactSubmitBtn');
    if (btn) { btn.innerText = "Sending..."; btn.disabled = true; }

    try {
        const res = await fetch('/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, message })
        });
        const data = await res.json();
        if (res.ok) {
            alert("✅ Your message has been sent to VoltDrive Support!");
            document.getElementById('contactForm').reset();
        } else alert("Error: " + data.message);
    } catch (err) { alert("Failed to send message. Please check your connection."); } 
    finally { if (btn) { btn.innerText = "Send Message"; btn.disabled = false; } }
}

async function loadCustomerMessages() {
    const container = document.getElementById('adminMessagesContainer');
    if (!container) return;

    const token = sessionStorage.getItem('admin_token');
    try {
        container.innerHTML = '<p class="text-gray-500 animate-pulse text-center py-5">Loading messages...</p>';
        const res = await fetch('/api/admin/messages', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error("Failed to fetch");
        const messages = await res.json();

        if (messages.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-5 font-medium">Your inbox is empty. No new messages.</p>';
            return;
        }

        container.innerHTML = messages.map(m => `
            <div class="bg-gray-50 p-5 rounded-2xl mb-4 border border-gray-100 shadow-sm">
                <div class="flex justify-between items-center mb-3">
                    <h4 class="font-bold text-gray-900">${m.customer_name} <span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md ml-2">${m.customer_email}</span></h4>
                    <span class="text-xs font-medium text-gray-400">${new Date(m.created_at).toLocaleString()}</span>
                </div>
                <p class="text-gray-700 text-sm leading-relaxed">${m.message}</p>
            </div>
        `).join('');
    } catch (err) { container.innerHTML = '<p class="text-red-500 font-bold text-center py-5">Database Error: Could not load messages.</p>'; }
}

function openMessagesModal() {
    const modal = document.getElementById('adminMessagesModal');
    const dropdown = document.getElementById('profileDropdown');
    if (dropdown) dropdown.classList.add('hidden'); 
    if (modal) { modal.classList.remove('hidden'); loadCustomerMessages(); }
}

function closeMessagesModal() {
    const modal = document.getElementById('adminMessagesModal');
    if (modal) modal.classList.add('hidden');
}

function openSecurityModal(id, name) {
    const idEl = document.getElementById('manageUserId');
    const nameEl = document.getElementById('manageUserName');
    const modal = document.getElementById('securityControlModal');
    if(idEl) idEl.innerText = '#' + id;
    if(nameEl) nameEl.innerText = name;
    if(modal) modal.classList.remove('hidden');
}

function closeSecurityModal() {
    const modal = document.getElementById('securityControlModal');
    if(modal) modal.classList.add('hidden');
}

function getUserStatusState(dateStr) {
    if (!dateStr) return { text: 'OFFLINE', online: false };
    const lastLoginDate = new Date(dateStr);
    const now = new Date();
    const diffMs = now - lastLoginDate;
    const diffMins = diffMs / (1000 * 60);
    if (diffMins >= 0 && diffMins <= 5) return { text: 'ACTIVE', online: true };
    return { text: 'OFFLINE', online: false };
}

async function loadRealCustomers() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return; 

    try {
        const token = sessionStorage.getItem('admin_token');
        const response = await fetch('/api/all-customers', { headers: { 'Authorization': `Bearer ${token}` } }); 
        const customers = await response.json();
        tbody.innerHTML = '';

        customers.forEach(customer => {
            let statusBadge = '';
            if (customer.status === 'Active') {
                const statusData = getUserStatusState(customer.last_login);
                const colorClass = statusData.online ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200';
                statusBadge = `<span class="${colorClass} py-1 px-3 rounded-lg text-xs font-black uppercase tracking-wider border">${statusData.text}</span>`;
            } else if (customer.status === 'Suspended') {
                statusBadge = '<span class="bg-orange-100 text-orange-700 py-1 px-3 rounded-lg text-xs font-black uppercase tracking-wider border border-orange-200">SUSPENDED</span>';
            } else {
                statusBadge = '<span class="bg-red-100 text-red-700 py-1 px-3 rounded-lg text-xs font-black uppercase tracking-wider border border-red-200">BANNED</span>';
            }

            const row = document.createElement('tr');
            row.className = 'hover:bg-gray-50 transition-colors bg-white';
            row.innerHTML = `
                <td class="p-5">
                    <div class="font-bold text-gray-900">${customer.name}</div>
                    <div class="text-sm text-gray-500">${customer.email}</div>
                </td>
                <td class="p-5">
                    <div class="text-sm font-mono font-bold text-blue-600">#${customer.uniqueId || customer.id || 'N/A'}</div>
                    <div class="text-xs font-medium text-gray-500">Verif: ${customer.verificationId || customer.verification_id || 'N/A'}</div>
                </td>
                <td class="p-5">
                    <div class="text-sm font-medium text-gray-900">${customer.rentedVehicles || 'None'}</div>
                </td>
                <td class="p-5">
                    <div class="font-black text-yellow-500 flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">stars</span> ${Math.floor(customer.voltPoints) || 0}
                    </div>
                </td>
                <td class="p-5">
                    ${statusBadge}
                </td>
                <td class="p-5 text-right">
                    <button onclick="openSecurityModal('${customer.uniqueId || customer.id}', '${customer.name}')" class="text-xs font-bold bg-gray-100 text-gray-700 hover:bg-blue-600 hover:text-white py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center gap-2 ml-auto">
                        <span class="material-symbols-outlined text-sm">security</span> Control
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading customers:", error);
        tbody.innerHTML = '<tr><td colspan="6" class="p-5 text-center text-red-500 font-bold">Failed to load customer database. Check server connection.</td></tr>';
    }
}

async function updateCustomerStatus(statusText) {
    const userIdStr = document.getElementById('manageUserId').innerText.replace('#', '');
    const token = sessionStorage.getItem('admin_token');
    try {
        const res = await fetch(`/api/users/${userIdStr}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: statusText })
        });
        if (res.ok) {
            alert(`✅ Security Action Executed: User has been marked as ${statusText}`);
            closeSecurityModal();
            loadRealCustomers(); 
        } else alert("Failed to update status.");
    } catch (err) { alert("Server error."); }
}

async function applyTimedBlock() {
    const userIdStr = document.getElementById('manageUserId').innerText.replace('#', '');
    const days = document.getElementById('blockDaysInput').value;
    if (!days || days <= 0) return alert("Please enter a valid number of days.");
    const token = sessionStorage.getItem('admin_token');
    try {
        const res = await fetch(`/api/users/${userIdStr}/block`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ days: parseInt(days) })
        });
        if (res.ok) {
            alert(`✅ User temporarily blocked for ${days} days.`);
            closeSecurityModal();
            loadRealCustomers(); 
        } else alert("Failed to apply block.");
    } catch (err) { alert("Server error."); }
}

async function unblockCustomer() {
    const userIdStr = document.getElementById('manageUserId').innerText.replace('#', '');
    const token = sessionStorage.getItem('admin_token');
    try {
        const res = await fetch(`/api/users/${userIdStr}/unblock`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert(`✅ Access Restored. User can now log in again.`);
            closeSecurityModal();
            loadRealCustomers(); 
        } else alert("Failed to unblock user.");
    } catch (err) { alert("Server error."); }
}

document.addEventListener('DOMContentLoaded', () => {
    let token = sessionStorage.getItem('customer_token');
    if (document.getElementById('statTotalCars') || document.getElementById('statRev') || document.getElementById('inventoryBody') || document.getElementById('bookingsBody') || document.getElementById('topVehicleChart') || document.getElementById('customersTableBody')) {
        token = sessionStorage.getItem('admin_token');
    }

    if (document.getElementById('fleetGrid')) {
        loadFleet();
        const searchBar = document.getElementById('searchBar');
        const typeSelect = document.getElementById('typeFilter');
        const sortSelect = document.getElementById('sortFilter');

        if (searchBar) searchBar.addEventListener('keyup', filterFleet);
        if (typeSelect) typeSelect.addEventListener('change', filterFleet);
        if (sortSelect) sortSelect.addEventListener('change', filterFleet);
    }
    
    if (document.getElementById('statTotalCars') || document.getElementById('statRev')) loadDashboard();

    if (document.getElementById('inventoryBody')) {
        loadInventory();
        const vehTypeSelect = document.getElementById('vehType');
        if (vehTypeSelect) {
            vehTypeSelect.addEventListener('change', toggleBatteryRange);
            toggleBatteryRange(); 
        }
    }

    if (document.getElementById('bookingsBody')) loadAdminBookings();
    if (document.getElementById('myBookingsTableBody')) loadMyBookings();
    if (document.getElementById('checkoutVehId')) initCheckout();
    if (document.getElementById('topVehicleChart')) loadReports();
    if (document.getElementById('customersTableBody')) loadRealCustomers();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);

    const signupForm = document.getElementById('signupForm');
    if (signupForm) signupForm.addEventListener('submit', handleSignup);
    
    const addVehicleForm = document.getElementById('addVehicleForm');
    if (addVehicleForm) addVehicleForm.addEventListener('submit', handleAddVehicle);
    
    const contactForm = document.getElementById('contactForm');
    if (contactForm) contactForm.addEventListener('submit', submitContactForm);
    
    const isLoginPage = window.location.pathname.includes('login.html') || window.location.pathname === '/' || window.location.pathname === '';
    
    if (!token && !isLoginPage) {
        window.location.href = 'login.html';
    }
});
