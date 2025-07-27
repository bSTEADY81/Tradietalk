/*
 * script.js – shared client-side logic for TradieTalk AI
 *
 * This file contains functions for user authentication (sign up, log in,
 * log out) as well as the logic required for the dashboard: voice
 * recognition, dynamic item management, quote calculations, PDF
 * generation, speech synthesis, and email composition.  The code is
 * designed to work with the HTML pages located in the same folder.
 */

// ---------------------- Authentication Helpers ----------------------

// Initialise Supabase client if the library is available.  The URL and anon
// key are intentionally left as placeholders so you can configure them
// without committing secrets to the repository.  Replace the values
// below with your project's URL (e.g. https://PROJECT_ID.supabase.co) and
// anon key, or set them via environment variables at build time.
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

let supabase = null;
if (typeof window !== 'undefined' && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    // If Supabase fails to initialise (e.g. missing library), supabase will remain null
    console.warn('Failed to initialise Supabase client:', err);
  }
}

/**
 * Retrieve the map of users stored in localStorage.  Returns an
 * object keyed by email.  If nothing exists yet, returns an empty
 * object.
 */
function getUsers() {
  try {
    return JSON.parse(localStorage.getItem('users')) || {};
  } catch (e) {
    return {};
  }
}

/**
 * Save the given users object back to localStorage.
 *
 * @param {Object} users
 */
function saveUsers(users) {
  localStorage.setItem('users', JSON.stringify(users));
}

/**
 * Register a new user based on the values entered in the sign‑up
 * form.  On success, the user is logged in and redirected to the
 * dashboard.  If the email is already registered, an error message
 * will be displayed.
 */
function registerUser() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;
  const errorEl = document.getElementById('signupError');
  errorEl.classList.add('hidden');

  // If Supabase is configured use it for authentication, otherwise fall back to localStorage
  if (supabase) {
    (async () => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } }
      });
      if (error) {
        errorEl.textContent = error.message;
        errorEl.classList.remove('hidden');
        return;
      }
      // On successful sign‑up redirect to the voice assistant page
      window.location.href = 'voice.html';
    })();
  } else {
    const users = getUsers();
    if (users[email]) {
      errorEl.textContent = 'That email is already registered.';
      errorEl.classList.remove('hidden');
      return;
    }
    users[email] = { name, email, password };
    saveUsers(users);
    localStorage.setItem('currentUser', email);
    window.location.href = 'voice.html';
  }
}

/**
 * Log in an existing user using the values entered in the login form.
 * If successful, sets the currentUser and redirects to the dashboard.
 * Otherwise, displays an error message.
 */
function loginUser() {
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.classList.add('hidden');

  if (supabase) {
    (async () => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // Show generic invalid credentials message
        errorEl.classList.remove('hidden');
        return;
      }
      window.location.href = 'voice.html';
    })();
  } else {
    const users = getUsers();
    const user = users[email];
    if (!user || user.password !== password) {
      errorEl.classList.remove('hidden');
      return;
    }
    localStorage.setItem('currentUser', email);
    window.location.href = 'voice.html';
  }
}

/**
 * Log out the current user by removing the session from localStorage.
 */
function logoutUser() {
  // Sign out of Supabase if configured
  (async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Error signing out of Supabase:', err);
      }
    }
    // Remove fallback session
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  })();
}

// ---------------------- Dashboard Logic ----------------------

/**
 * Initialise the dashboard when the DOM is ready.  Sets up event
 * listeners, populates voices, and ensures the user is authenticated.
 */
async function initDashboard() {
  // Redirect to login if the user is not authenticated.  Prefer Supabase session if configured.
  if (supabase) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = 'login.html';
        return;
      }
    } catch (err) {
      console.warn('Error retrieving Supabase session:', err);
      window.location.href = 'login.html';
      return;
    }
  } else {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
      window.location.href = 'login.html';
      return;
    }
  }

  // At this point, the user is authenticated (either via Supabase or fallback). Continue initialisation.

  // Attach logout handler
  const logoutLink = document.getElementById('logoutLink');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
    });
  }

  // Table body and actions
  const itemsTableBody = document.querySelector('#itemsTable tbody');
  const addItemBtn = document.getElementById('addItemBtn');
  const calculateBtn = document.getElementById('calculateBtn');
  const generatePdfBtn = document.getElementById('generatePdfBtn');
  const readQuoteBtn = document.getElementById('readQuoteBtn');
  const sendEmailBtn = document.getElementById('sendEmailBtn');
  const marginInput = document.getElementById('margin');
  const tradeTypeSelect = document.getElementById('tradeType');
  const voiceSelect = document.getElementById('voiceSelect');

  // Totals display elements
  const subtotalDisplay = document.getElementById('subtotalDisplay');
  const gstDisplay = document.getElementById('gstDisplay');
  const totalDisplay = document.getElementById('totalDisplay');

  // Initialise voices for speech synthesis
  function populateVoices() {
    const voices = window.speechSynthesis.getVoices();
    voiceSelect.innerHTML = '';
    voices.forEach((voice, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `${voice.name} (${voice.lang})`;
      // Choose an English voice by default
      if (voice.lang.startsWith('en') && !voiceSelect.selectedIndex) {
        opt.selected = true;
      }
      voiceSelect.appendChild(opt);
    });
  }
  // Some browsers populate voices asynchronously
  populateVoices();
  window.speechSynthesis.onvoiceschanged = populateVoices;

  // Items array – not strictly necessary but helps with calculations
  // Each entry will hold { row, descInput, qtyInput, priceInput, totalCell }
  const itemRows = [];

  function addItemRow() {
    const row = document.createElement('tr');
    row.classList.add('border-b');
    const descTd = document.createElement('td');
    const qtyTd = document.createElement('td');
    const priceTd = document.createElement('td');
    const totalTd = document.createElement('td');
    const removeTd = document.createElement('td');

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'w-full border border-gray-300 rounded px-2 py-1';
    descTd.appendChild(descInput);

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '0';
    qtyInput.step = '1';
    qtyInput.value = '0';
    qtyInput.className = 'w-full border border-gray-300 rounded px-2 py-1';
    qtyTd.appendChild(qtyInput);

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.min = '0';
    priceInput.step = '0.01';
    priceInput.value = '0';
    priceInput.className = 'w-full border border-gray-300 rounded px-2 py-1';
    priceTd.appendChild(priceInput);

    totalTd.className = 'px-3 py-2';
    totalTd.textContent = '0.00';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-red-600 hover:text-red-800';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => {
      itemsTableBody.removeChild(row);
      const idx = itemRows.findIndex((r) => r.row === row);
      if (idx > -1) itemRows.splice(idx, 1);
      recalcTotals();
    });
    removeTd.appendChild(removeBtn);

    row.appendChild(descTd);
    row.appendChild(qtyTd);
    row.appendChild(priceTd);
    row.appendChild(totalTd);
    row.appendChild(removeTd);

    // Listen to changes on qty and price inputs to update row total
    function updateRowTotal() {
      const qty = parseFloat(qtyInput.value) || 0;
      const price = parseFloat(priceInput.value) || 0;
      const total = qty * price;
      totalTd.textContent = total.toFixed(2);
      recalcTotals();
    }
    qtyInput.addEventListener('input', updateRowTotal);
    priceInput.addEventListener('input', updateRowTotal);

    itemsTableBody.appendChild(row);
    itemRows.push({ row, descInput, qtyInput, priceInput, totalTd });
  }

  function recalcTotals() {
    let subtotal = 0;
    itemRows.forEach((item) => {
      const qty = parseFloat(item.qtyInput.value) || 0;
      const price = parseFloat(item.priceInput.value) || 0;
      subtotal += qty * price;
    });
    const margin = parseFloat(marginInput.value) || 0;
    const subtotalWithMargin = subtotal + subtotal * (margin / 100);
    const gst = subtotalWithMargin * 0.1;
    const total = subtotalWithMargin + gst;
    subtotalDisplay.textContent = subtotal.toFixed(2);
    gstDisplay.textContent = gst.toFixed(2);
    totalDisplay.textContent = total.toFixed(2);
  }

  // Add initial row
  addItemRow();

  addItemBtn.addEventListener('click', () => {
    addItemRow();
  });

  calculateBtn.addEventListener('click', recalcTotals);

  // Voice Recognition for job description
  const startVoiceBtn = document.getElementById('startVoiceBtn');
  const jobDescription = document.getElementById('jobDescription');
  const voiceStatus = document.getElementById('voiceStatus');
  let recognition;
  if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
  } else if ('SpeechRecognition' in window) {
    recognition = new SpeechRecognition();
  }
  if (recognition) {
    recognition.lang = 'en-AU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    startVoiceBtn.addEventListener('click', () => {
      try {
        recognition.start();
        voiceStatus.textContent = 'Listening…';
      } catch (err) {
        console.error(err);
      }
    });
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      jobDescription.value = (jobDescription.value + ' ' + transcript).trim();
      voiceStatus.textContent = 'Voice captured';
    };
    recognition.onerror = (event) => {
      voiceStatus.textContent = 'Error capturing voice';
      console.error('Speech recognition error', event.error);
    };
    recognition.onend = () => {
      voiceStatus.textContent = '';
    };
  } else {
    startVoiceBtn.disabled = true;
    startVoiceBtn.classList.add('opacity-50', 'cursor-not-allowed');
    voiceStatus.textContent = 'Voice recognition not supported';
  }

  // Generate PDF
  generatePdfBtn.addEventListener('click', () => {
    recalcTotals();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const users = getUsers();
    const currentEmail = localStorage.getItem('currentUser');
    const user = users[currentEmail] || { name: 'Tradie' };
    let y = 10;
    doc.setFontSize(16);
    doc.text(`Quote from ${user.name} (${currentEmail})`, 10, y);
    y += 8;
    doc.setFontSize(12);
    const clientName = document.getElementById('clientName').value || 'Client';
    const clientEmail = document.getElementById('clientEmail').value || '';
    doc.text(`To: ${clientName}`, 10, y);
    y += 6;
    if (clientEmail) {
      doc.text(`Email: ${clientEmail}`, 10, y);
      y += 6;
    }
    doc.text(`Trade Type: ${tradeTypeSelect.value}`, 10, y);
    y += 6;
    doc.text('Job Description:', 10, y);
    y += 6;
    const lines = doc.splitTextToSize(jobDescription.value || '', 180);
    doc.text(lines, 10, y);
    y += lines.length * 6 + 4;
    // Table header
    doc.text('Description', 10, y);
    doc.text('Qty', 80, y);
    doc.text('Unit $', 110, y);
    doc.text('Total $', 150, y);
    y += 4;
    doc.setLineWidth(0.1);
    doc.line(10, y, 200, y);
    y += 4;
    // Table rows
    itemRows.forEach((item) => {
      const desc = item.descInput.value || '';
      const qty = parseFloat(item.qtyInput.value) || 0;
      const price = parseFloat(item.priceInput.value) || 0;
      const total = qty * price;
      doc.text(desc.substring(0, 40), 10, y);
      doc.text(qty.toString(), 80, y, { align: 'right' });
      doc.text(price.toFixed(2), 110, y, { align: 'right' });
      doc.text(total.toFixed(2), 150, y, { align: 'right' });
      y += 6;
    });
    y += 2;
    doc.line(10, y, 200, y);
    y += 6;
    // Totals
    doc.text(`Subtotal: $${subtotalDisplay.textContent}`, 120, y);
    y += 6;
    doc.text(`Margin (${marginInput.value}%): ${(parseFloat(marginInput.value) || 0).toFixed(1)}%`, 120, y);
    y += 6;
    doc.text(`GST (10%): $${gstDisplay.textContent}`, 120, y);
    y += 6;
    doc.text(`Total: $${totalDisplay.textContent}`, 120, y);
    // Save file
    doc.save(`quote-${clientName.replace(/\s+/g, '_') || 'client'}.pdf`);
  });

  // Read quote aloud using speech synthesis
  readQuoteBtn.addEventListener('click', () => {
    recalcTotals();
    const synth = window.speechSynthesis;
    if (!synth) return;
    const voices = synth.getVoices();
    const selectedVoice = voices[parseInt(voiceSelect.value, 10)] || voices[0];
    const users = getUsers();
    const currentEmail = localStorage.getItem('currentUser');
    const user = users[currentEmail] || { name: 'Tradie' };
    const clientName = document.getElementById('clientName').value || 'client';
    let text = `Quote from ${user.name}.`; 
    text += ` To ${clientName}. `;
    text += `Job description: ${jobDescription.value}. `;
    itemRows.forEach((item) => {
      const desc = item.descInput.value || 'item';
      const qty = parseFloat(item.qtyInput.value) || 0;
      const price = parseFloat(item.priceInput.value) || 0;
      text += `${desc}, quantity ${qty}, unit price ${price} dollars. `;
    });
    text += `Subtotal ${subtotalDisplay.textContent} dollars. Margin ${marginInput.value} percent. GST ${gstDisplay.textContent} dollars. Total ${totalDisplay.textContent} dollars.`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = selectedVoice;
    synth.cancel();
    synth.speak(utterance);
  });

  // Send email via mailto
  sendEmailBtn.addEventListener('click', () => {
    recalcTotals();
    const clientEmail = document.getElementById('clientEmail').value.trim();
    const users = getUsers();
    const currentEmail = localStorage.getItem('currentUser');
    const user = users[currentEmail] || { name: 'Tradie' };
    const subject = `Quote from ${user.name}`;
    let body = `Hello,\n\nPlease find your quote below:\n\n`;
    body += `Job description: ${jobDescription.value}\n\n`;
    itemRows.forEach((item) => {
      const desc = item.descInput.value || 'item';
      const qty = parseFloat(item.qtyInput.value) || 0;
      const price = parseFloat(item.priceInput.value) || 0;
      const total = qty * price;
      body += `${desc} – Qty: ${qty}, Unit $${price.toFixed(2)}, Total $${total.toFixed(2)}\n`;
    });
    body += `\nSubtotal: $${subtotalDisplay.textContent}\n`;
    body += `Margin (${marginInput.value}%): included\n`;
    body += `GST (10%): $${gstDisplay.textContent}\n`;
    body += `Total: $${totalDisplay.textContent}\n\n`;
    body += 'Thank you for your business!\n';
    // Compose mailto link; if no clientEmail provided, use empty string so that mail client prompts for recipient
    const mailto = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  });
}