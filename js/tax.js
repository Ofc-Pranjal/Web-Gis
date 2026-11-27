// House tax page.
//
// Reaches here as tax.html?house=<localityId>-<houseNo>, the id that app.js
// assigns when it splits an allahabad_parcels_2009 MultiPoint into individual
// house points.
//
// The payment flow is a DEMONSTRATION: it writes a ledger row and prints a
// receipt, but no money moves and no payment credentials are collected.

const PARCEL_TABLE = 'allahabad_parcels_2009';

// Indian financial year: starts in April.
const now = new Date();
const ASSESSMENT_YEAR = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

// Monthly rateable value per sq ft, by property type.
const RATE_PER_SQFT = {
  'Residential': 1.20,
  'Commercial': 3.50,
  'Mixed Use': 2.00
};

const HOUSE_TAX_RATE = 0.12;   // 12% of ARV
const WATER_CESS_RATE = 0.075; // 7.5% of ARV

const params = new URLSearchParams(window.location.search);
const houseUid = params.get('house');

let state = {
  localityId: null,
  houseNo: null,
  localityName: '—',
  lon: null,
  lat: null,
  register: null,     // row from house_tax_register, or null
  assessment: null,   // {type, area, arv, houseTax, waterCess, arrears, total}
  payments: [],
  provisional: true
};

const rupees = value =>
  '₹ ' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const text = (id, value) => { document.getElementById(id).textContent = value; };

// Stable pseudo-random seed so a given house always gets the same provisional
// assessment instead of a new one on every page load.
function seedFrom(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function showSetupNotice(detail) {
  document.getElementById('setupNotice').hidden = false;
  document.getElementById('taxBody').hidden = true;
  if (detail) document.getElementById('setupDetail').textContent = detail;
}

function isMissingTable(error) {
  if (!error) return false;
  const code = error.code || '';
  const message = (error.message || '').toLowerCase();
  return code === 'PGRST205' || code === '42P01' || message.includes('could not find the table');
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------
function buildAssessment(register) {
  const seed = seedFrom(houseUid);

  let type, area, provisional;
  if (register && register.built_up_area) {
    type = register.property_type || 'Residential';
    area = Number(register.built_up_area);
    provisional = false;
  } else {
    // Provisional figures until the property is formally assessed.
    type = ['Residential', 'Residential', 'Residential', 'Commercial', 'Mixed Use'][seed % 5];
    area = 450 + (seed % 1800);
    provisional = true;
  }

  const arv = area * (RATE_PER_SQFT[type] || RATE_PER_SQFT.Residential) * 12;
  const houseTax = arv * HOUSE_TAX_RATE;
  const waterCess = arv * WATER_CESS_RATE;
  // Roughly a quarter of properties carry arrears from the previous year.
  const arrears = (seed % 4 === 0) ? Math.round((houseTax + waterCess) * 0.35) : 0;

  state.provisional = provisional;
  return {
    type,
    area,
    arv,
    houseTax,
    waterCess,
    arrears,
    total: houseTax + waterCess + arrears
  };
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
async function load() {
  if (!houseUid || !/^\d+-\d+$/.test(houseUid)) {
    document.getElementById('taxBody').hidden = true;
    showSetupNotice('No valid property id in the URL. Open this page by clicking a house on the map.');
    document.querySelector('#setupNotice strong').textContent = 'No property selected.';
    return;
  }

  const [localityId, houseNo] = houseUid.split('-').map(Number);
  state.localityId = localityId;
  state.houseNo = houseNo;

  // Locality name + this house's coordinates, straight from the parcel row.
  const { data: parcel } = await supabaseClient
    .from(PARCEL_TABLE)
    .select('id,name,wkb_geometry')
    .eq('id', localityId)
    .maybeSingle();

  if (parcel) {
    state.localityName = parcel.name || 'Unnamed';
    const coords = parcel.wkb_geometry && parcel.wkb_geometry.coordinates;
    if (coords && coords[houseNo - 1]) {
      state.lon = coords[houseNo - 1][0];
      state.lat = coords[houseNo - 1][1];
    }
  }

  // Register row (may not exist).
  const registerResult = await supabaseClient
    .from('house_tax_register')
    .select('*')
    .eq('house_uid', houseUid)
    .maybeSingle();

  if (isMissingTable(registerResult.error)) {
    showSetupNotice(registerResult.error.message);
    return;
  }
  state.register = registerResult.data;

  // Payment ledger for the current year.
  const paymentsResult = await supabaseClient
    .from('house_tax_payment')
    .select('*')
    .eq('house_uid', houseUid)
    .order('paid_at', { ascending: false });

  if (isMissingTable(paymentsResult.error)) {
    showSetupNotice(paymentsResult.error.message);
    return;
  }
  state.payments = paymentsResult.data || [];

  state.assessment = buildAssessment(state.register);

  document.getElementById('taxBody').hidden = false;
  render();
}

function paidThisYear() {
  return state.payments
    .filter(p => p.assessment_year === ASSESSMENT_YEAR)
    .reduce((sum, p) => sum + Number(p.amount), 0);
}

function render() {
  const a = state.assessment;

  text('pHouseUid', houseUid);
  text('pLocality', state.localityName);
  text('pHouseNo', state.houseNo);
  text('pLocalityCode', state.localityId);
  text('pCoords', state.lat != null ? `${state.lat.toFixed(6)}, ${state.lon.toFixed(6)}` : 'Not available');
  text('pOwner', (state.register && state.register.owner_name) || 'Not on record');
  text('pType', a.type);
  text('pArea', `${a.area.toLocaleString('en-IN')} sq ft`);
  text('pYear', `FY ${ASSESSMENT_YEAR}–${String(ASSESSMENT_YEAR + 1).slice(2)}`);

  document.getElementById('assessmentNote').textContent = state.provisional
    ? 'Provisional assessment — this property is not yet on the register, so area and type are estimated. Enter the real values to generate an accurate demand.'
    : `Assessed from the register, last updated ${new Date(state.register.updated_at).toLocaleDateString('en-IN')}.`;
  document.getElementById('assessmentNote').className =
    'assessment-note' + (state.provisional ? ' provisional' : '');

  text('dArv', rupees(a.arv));
  text('dHouseTax', rupees(a.houseTax));
  text('dWater', rupees(a.waterCess));
  text('dArrears', rupees(a.arrears));
  text('dTotal', rupees(a.total));

  const paid = paidThisYear();
  const balance = Math.max(0, a.total - paid);
  text('dPaid', rupees(paid));
  text('dBalance', rupees(balance));

  // Payment form reflects the outstanding balance.
  const amountInput = document.getElementById('payAmount');
  amountInput.value = balance > 0 ? balance.toFixed(2) : '';
  amountInput.max = balance > 0 ? balance.toFixed(2) : '';
  document.getElementById('paidInFull').hidden = balance > 0;
  document.getElementById('paymentForm').hidden = balance <= 0;

  // Prefill the register form with whatever is currently in effect.
  document.getElementById('ownerName').value = (state.register && state.register.owner_name) || '';
  document.getElementById('propertyType').value = a.type;
  document.getElementById('builtUpArea').value = a.area;

  renderHistory();
}

function renderHistory() {
  const container = document.getElementById('historyContainer');

  if (state.payments.length === 0) {
    container.innerHTML = '<p class="muted">No payments recorded for this property.</p>';
    return;
  }

  const rows = state.payments.map(p => `
    <tr>
      <td>${new Date(p.paid_at).toLocaleString('en-IN')}</td>
      <td class="mono">${p.receipt_no}</td>
      <td>FY ${p.assessment_year}–${String(p.assessment_year + 1).slice(2)}</td>
      <td>${p.method || '—'}</td>
      <td class="amount">${rupees(p.amount)}</td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="history-table">
      <thead>
        <tr><th>Date</th><th>Receipt No.</th><th>Year</th><th>Method</th><th>Amount</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// Register the owner / assessment
// ---------------------------------------------------------------------------
function toggleRegisterForm() {
  const form = document.getElementById('registerForm');
  form.hidden = !form.hidden;
  document.getElementById('registerToggleLabel').textContent =
    form.hidden ? 'Update owner & assessment' : 'Cancel';
}

document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = document.getElementById('saveRegisterBtn');
  button.disabled = true;
  button.textContent = 'Saving…';

  const payload = {
    house_uid: houseUid,
    locality_id: state.localityId,
    locality_name: state.localityName,
    owner_name: document.getElementById('ownerName').value.trim() || null,
    property_type: document.getElementById('propertyType').value,
    built_up_area: Number(document.getElementById('builtUpArea').value) || null,
    assessment_year: ASSESSMENT_YEAR,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabaseClient
    .from('house_tax_register')
    .upsert(payload, { onConflict: 'house_uid' })
    .select()
    .maybeSingle();

  button.disabled = false;
  button.textContent = 'Save assessment';

  if (error) {
    alert('Could not save the assessment: ' + error.message);
    return;
  }

  state.register = data;
  state.assessment = buildAssessment(data);
  toggleRegisterForm();
  render();
});

// ---------------------------------------------------------------------------
// Demo payment
// ---------------------------------------------------------------------------
function makeReceiptNo() {
  const stamp = Date.now().toString(36).toUpperCase();
  const salt = Math.floor(Math.random() * 1296).toString(36).toUpperCase().padStart(2, '0');
  return `DEMO/${ASSESSMENT_YEAR}/${houseUid}/${stamp}${salt}`;
}

function showPayMessage(message, type) {
  const box = document.getElementById('payMessage');
  box.textContent = message;
  box.className = `pay-message ${type}`;
  box.hidden = false;
}

document.getElementById('paymentForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const amount = Number(document.getElementById('payAmount').value);
  const method = document.getElementById('payMethod').value;
  const balance = Math.max(0, state.assessment.total - paidThisYear());

  if (!(amount > 0)) {
    showPayMessage('Enter an amount greater than zero.', 'error');
    return;
  }
  if (amount > balance + 0.009) {
    showPayMessage(`Amount exceeds the outstanding balance of ${rupees(balance)}.`, 'error');
    return;
  }

  const button = document.getElementById('payBtn');
  button.disabled = true;
  button.textContent = 'Recording…';

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const user = sessionData.session ? sessionData.session.user : null;

  const receiptNo = makeReceiptNo();
  const { data, error } = await supabaseClient
    .from('house_tax_payment')
    .insert({
      house_uid: houseUid,
      assessment_year: ASSESSMENT_YEAR,
      receipt_no: receiptNo,
      amount: amount,
      method: method,
      is_demo: true,
      paid_by: user ? user.id : null
    })
    .select()
    .single();

  button.disabled = false;
  button.textContent = 'Record Demo Payment';

  if (error) {
    showPayMessage('Payment could not be recorded: ' + error.message, 'error');
    return;
  }

  showPayMessage('Demo payment recorded. No money was transferred.', 'success');
  state.payments.unshift(data);

  // Receipt
  text('rNo', data.receipt_no);
  text('rDate', new Date(data.paid_at).toLocaleString('en-IN'));
  text('rHouse', `${houseUid} — ${state.localityName}`);
  text('rAmount', rupees(data.amount));
  text('rMethod', data.method);
  text('rPayer', user ? user.email : '—');
  document.getElementById('receiptCard').hidden = false;
  document.getElementById('receiptCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  render();
});

load();
