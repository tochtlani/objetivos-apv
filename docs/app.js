'use strict';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CAMPOS = ['prospectos', 'demos', 'solicitudes', 'crednissa', 'facturas', 'entregas'];
const ETIQUETAS = {
  prospectos: 'Prospectos', demos: 'Demos', solicitudes: 'Solicitudes',
  crednissa: 'Créditos', facturas: 'Facturas', entregas: 'Entregas',
};

const CAMPO_CAPTURA = 'facturas';
const CAMPOS_CALCULADOS = ['prospectos', 'demos', 'solicitudes', 'crednissa', 'entregas'];

function redondea(n, d) {
  return Math.floor((n * 2 + d) / (d * 2));
}

function calculados(facturas) {
  const prospectos = facturas * 5;
  return {
    prospectos,
    demos: redondea(prospectos * 5, 10),
    solicitudes: redondea(prospectos * 8, 10),
    crednissa: redondea(prospectos * 7, 10),
    facturas,
    entregas: facturas,
  };
}

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

let ctx = null;
let sucursales = [];
let gerentes = [];
let pendienteVincular = null;
let temporizadorToast = null;
let mesEditable = true;

function esTemaOscuroDelSistema() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function temaActivo() {
  const guardado = localStorage.getItem('tema');
  if (guardado === 'oscuro' || guardado === 'claro') return guardado;
  return esTemaOscuroDelSistema() ? 'oscuro' : 'claro';
}

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-tema', tema);
  localStorage.setItem('tema', tema);

  const meta =  (document.querySelector('meta[name="theme-color"]'));
  if (meta) meta.content = tema === 'oscuro' ? '#050505' : '#0f172a';
}

(function inicializarToggleTema() {
  const toggle = $('#toggle-tema');
  if (!toggle) return;

  toggle.checked = temaActivo() === 'oscuro';

  toggle.addEventListener('change', () => {
    aplicarTema(toggle.checked ? 'oscuro' : 'claro');
  });
})();

async function api(ruta, opciones = {}) {
  const res = await fetch(`/api/datos/${ruta}`, {
    method: opciones.method || 'GET',
    headers: opciones.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {  }
  if (!res.ok) {
    const err =  (new Error(data.error || `Error ${res.status}`));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function aviso(msg, tono = 'aviso') {
  const el = $('#aviso');
  el.textContent = msg || '';
  el.className = `nota nota-${tono}`;
  el.hidden = !msg;
}

function toast(msg, malo = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('malo', malo);
  el.hidden = false;
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => { el.hidden = true; }, malo ? 8000 : 4500);
}

function celda(fila, texto, clase) {
  const td = document.createElement('td');
  td.textContent = texto == null ? '' : String(texto);
  if (clase) td.className = clase;
  fila.appendChild(td);
  return td;
}

function boton(texto, clase, alHacerClic) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = clase;
  b.textContent = texto;
  b.addEventListener('click', alHacerClic);
  return b;
}

function fechaHora(valor) {
  if (!valor) return '';
  const d = new Date(String(valor));
  if (Number.isNaN(d.getTime())) return String(valor).slice(0, 16);

  return d.toLocaleString('sv-SE', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function fecha(valor) {
  if (!valor) return '';
  const s = String(valor);
  if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z?)?$/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return d.toLocaleDateString('es-MX', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  });
}

function errorLogin(msg) {
  const el = $('#error-login');
  el.textContent = msg || '';
  el.hidden = !msg;
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  errorLogin('');
  const btn = $('#btn-login');
  const etiqueta = $('#btn-login-texto');
  btn.disabled = true;
  etiqueta.textContent = 'Entrando...';

  const fd = new FormData(e.target);
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      errorLogin(d.error || 'No se pudo entrar');
      return;
    }

    try {
      await arrancar();
    } catch (err) {
      errorLogin(`Tu usuario y contraseña son correctos, pero el servidor de datos no respondió: ${err.message}`);
    }
  } finally {
    btn.disabled = false;
    etiqueta.textContent = 'Entrar al sistema';
  }
});

$('#btn-salir').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  location.reload();
});

function mostrarLogin() {
  $('#pantalla-login').hidden = false;
  $('#pantalla-app').hidden = true;
}

async function arrancar() {
  try {
    ctx = await api('contexto');
  } catch (err) {
    if (err.status === 401) { mostrarLogin(); return; }
    throw err;
  }

  $('#pantalla-login').hidden = true;
  $('#pantalla-app').hidden = false;
  $('#quien').textContent = ctx.usuario;
  const ETIQUETA_ROL = { admin: 'Administrador', rh: 'Recursos Humanos', gerente: 'Gerente' };
  $('#cab-sub').textContent = ETIQUETA_ROL[ctx.rol] || 'Gerente';

  if (ctx.rol === 'admin') $$('.solo-admin').forEach((el) => { el.hidden = false; });
  if (ctx.rol === 'admin' || ctx.rol === 'rh') $$('.admin-o-rh').forEach((el) => { el.hidden = false; });

  if (ctx.sin_agencias) {
    aviso('Tu usuario es de RH pero todavía no tiene agencias asignadas, así que no verás '
      + 'ningún APV. Un administrador tiene que asignártelas en Administración › Personal de RH.');
  }
  if (ctx.sin_alta) {
    aviso('Tu usuario no está dado de alta como gerente, o fue dado de baja. Un administrador tiene que '
      + 'registrarlo o reactivarlo en Administración › Gerentes antes de que puedas capturar.');
  }

  $('#f-anio').value = ctx.anio_actual;
  llenarSelect($('#f-mes'), MESES.map((n, i) => [i + 1, n]));
  $('#f-mes').value = String(ctx.mes_actual);
  llenarSelect($('#ap-mes'), MESES.map((n, i) => [i + 1, n]));
  $('#db-f-anio').value = ctx.anio_actual;
  llenarSelect($('#db-f-mes'), MESES.map((n, i) => [i + 1, n]));
  $('#db-f-mes').value = String(ctx.mes_actual);
  $('#fc-f-anio').value = ctx.anio_actual;
  llenarSelect($('#fc-f-mes'), MESES.map((n, i) => [i + 1, n]));
  $('#fc-f-mes').value = String(ctx.mes_actual);
  $('#ap-anio').value = ctx.anio_actual;

  try {
    sucursales = (await api('sucursales')).rows;
  } catch (err) {
    aviso(`No se pudo leer el catálogo de agencias: ${err.message}`, 'error');
    sucursales = [];
  }

  if (ctx.rol === 'admin' || ctx.rol === 'rh') await cargarGerentes();

  mostrarVista('objetivos');
  await cargarObjetivos();
  await cargarApv();
}

function llenarSelect(sel, pares, vacio = null) {
  if (!sel) return;
  sel.innerHTML = '';
  if (vacio !== null) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = vacio;
    sel.appendChild(o);
  }
  for (const [valor, texto] of pares) {
    const o = document.createElement('option');
    o.value = String(valor);
    o.textContent = texto;
    sel.appendChild(o);
  }
}

$$('.tab').forEach((b) => b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

function mostrarVista(nombre) {
  $$('.vista').forEach((v) => { v.hidden = v.id !== `vista-${nombre}`; });
  $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vista === nombre)));
  if (nombre === 'dashboard') cargarDashboard();
  if (nombre === 'forecast') cargarForecast();
  if (nombre === 'admin') {
    cargarGerentes(); cargarCandidatosGerente();

    if (ctx.rol === 'admin') { cargarAperturas(); cargarUsuariosRh(); }
  }
}

$('#f-mes').addEventListener('change', cargarObjetivos);
$('#f-anio').addEventListener('change', cargarObjetivos);
$('#btn-mes-ant').addEventListener('click', () => moverMes(-1));
$('#btn-mes-sig').addEventListener('click', () => moverMes(1));

function moverMes(paso) {
  let mes = parseInt($('#f-mes').value, 10) + paso;
  let anio = parseInt($('#f-anio').value, 10);
  if (mes < 1) { mes = 12; anio -= 1; }
  if (mes > 12) { mes = 1; anio += 1; }
  $('#f-mes').value = String(mes);
  $('#f-anio').value = String(anio);
  cargarObjetivos();
}

const ICONO_SELLO = {
  abierto: 'M20 6 9 17l-5-5',
  cerrado: 'M5 11.5h14v9.5H5z M8.5 11.5V8a3.5 3.5 0 0 1 7 0v3.5',
  reabierto: 'M5 11.5h14v9.5H5z M8.5 11.5V8a3.5 3.5 0 0 1 6.7-1.4',
};

function pintarSello(data) {
  const sello = $('#sello-mes');
  const texto = $('#sello-texto');
  const nota = $('#exp-estado');

  const reabierto = data.editable && data.reabierto;
  const estado = data.editable ? (reabierto ? 'reabierto' : 'abierto') : 'cerrado';
  mesEditable = data.editable;
  sello.dataset.estado = estado;
  texto.textContent = estado;
  $('#sello-icono-trazo').setAttribute('d', ICONO_SELLO[estado]);

  if (estado === 'abierto') {
    nota.textContent = 'Puedes capturar y volver a guardar cuantas veces quieras mientras el mes siga abierto.';
  } else if (estado === 'reabierto') {
    nota.textContent = data.motivo
      ? `Un administrador reabrió este mes para ti: ${data.motivo}`
      : 'Un administrador reabrió este mes para ti. Al cerrarse la reapertura, deja de poder editarse.';
  } else {
    nota.textContent = data.motivo || 'El mes ya cerró. Un administrador tiene que reabrirlo para ti.';
  }
}

const gruposPlegados = new Set();

function cabeceraGrupo(nombre, id) {
  const tr = document.createElement('tr');
  tr.className = 'grupo-cab';
  const th = document.createElement('th');
  th.colSpan = 8;
  th.setAttribute('scope', 'colgroup');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'grupo-toggle';
  btn.setAttribute('aria-controls', id);
  btn.setAttribute('aria-expanded', String(!gruposPlegados.has(nombre)));

  const SVG = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({
    class: 'grupo-chevron', width: '16', height: '16', viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5',
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  })) svg.setAttribute(k, v);
  const trazo = document.createElementNS(SVG, 'path');
  trazo.setAttribute('d', 'M6 9l6 6 6-6');
  svg.appendChild(trazo);
  btn.appendChild(svg);

  const ger = document.createElement('span');
  ger.className = 'grupo-nombre';
  ger.textContent = nombre;
  btn.appendChild(ger);

  for (const clase of ['grupo-cuenta', 'grupo-falta', 'grupo-sucio']) {
    const dato = document.createElement('span');
    dato.className = clase;
    btn.appendChild(dato);
  }

  th.appendChild(btn);
  tr.appendChild(th);
  return tr;
}

$('#tabla-objetivos').addEventListener('click', (e) => {
  const btn = e.target.closest('.grupo-toggle');
  if (!btn) return;
  const tb = btn.closest('tbody');
  const plegado = tb.classList.toggle('plegado');
  btn.setAttribute('aria-expanded', String(!plegado));
  if (plegado) gruposPlegados.add(tb.dataset.gerente);
  else gruposPlegados.delete(tb.dataset.gerente);
});

function valorRubro(tr, campo) {
  const inp = tr.querySelector(`input[data-campo="${campo}"]`);
  if (inp) return Number(inp.value || 0);
  const td = tr.querySelector(`td[data-campo="${campo}"]`);
  return td ? Number(td.dataset.valor || 0) : 0;
}

function pintarCalculados(tr) {
  const inp = tr.querySelector(`input[data-campo="${CAMPO_CAPTURA}"]`);
  const cifras = calculados(Math.max(0, Math.trunc(Number(inp?.value || 0)) || 0));
  for (const c of CAMPOS_CALCULADOS) {
    const td = tr.querySelector(`td[data-campo="${c}"]`);
    if (!td) continue;
    td.dataset.valor = cifras[c];
    td.textContent = cifras[c];

    td.classList.remove('desfasado');
    td.title = `${ETIQUETAS[c]} se calcula de las facturas.`;
  }
}

function marcarDesfase(tr, r) {
  const esperado = calculados(Number(r[CAMPO_CAPTURA]) || 0);
  for (const c of CAMPOS_CALCULADOS) {
    const guardado = Number(r[c]) || 0;
    if (guardado === esperado[c]) continue;
    const td = tr.querySelector(`td[data-campo="${c}"]`);
    if (!td) continue;
    td.classList.add('desfasado');
    td.title = `Se capturó a mano antes de que ${ETIQUETAS[c].toLowerCase()} fuera calculado. `
      + `Por la fórmula serían ${esperado[c]}: al guardar este asesor se ajusta.`;
  }
}

function renglonObjetivo(r, conGerente) {
  const tr = document.createElement('tr');
  tr.dataset.apv = r.apv_id;
  tr.dataset.sucursal = r.sucursal;
  if (!r.editable) tr.classList.add('cerrado');

  const tdAsesor = document.createElement('td');
  const nombre = document.createElement('div');
  nombre.className = 'asesor-nombre';
  nombre.textContent = r.asesor;
  tdAsesor.appendChild(nombre);

  const linea = document.createElement('div');
  linea.className = 'asesor-linea';
  const suc = document.createElement('span');
  suc.textContent = r.sucursal;
  linea.appendChild(suc);
  if (conGerente) {
    const sep = document.createElement('span');
    sep.className = 'sep';
    sep.textContent = '·';
    linea.appendChild(sep);
    const ger = document.createElement('span');
    ger.textContent = r.gerente;
    linea.appendChild(ger);
  }
  if (r.gerente_cambio) {
    const marca = document.createElement('span');
    marca.className = 'marca-rotacion';
    marca.textContent = 'cargado antes de la rotación';
    marca.title = 'El objetivo de este mes quedó a nombre del gerente que lo cargó. '
      + 'Si lo editas y guardas, pasa a ser tuyo.';
    linea.appendChild(marca);
  }
  tdAsesor.appendChild(linea);
  tr.appendChild(tdAsesor);

  for (const c of CAMPOS) {
    const td = document.createElement('td');
    td.className = 'celda-num';
    td.dataset.campo = c;

    if (c !== CAMPO_CAPTURA) {
      td.classList.add('celda-calc');
      td.dataset.valor = r[c] == null ? 0 : r[c];
      td.textContent = td.dataset.valor;
      td.title = `${ETIQUETAS[c]} se calcula de las facturas.`;
      tr.appendChild(td);
      continue;
    }

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.min = '0';
    inp.step = '1';
    inp.inputMode = 'numeric';
    inp.placeholder = '0';
    inp.value = r[c] == null ? '' : r[c];
    inp.dataset.campo = c;
    inp.dataset.original = inp.value;
    inp.setAttribute('aria-label', `${ETIQUETAS[c]} de ${r.asesor}`);

    inp.disabled = !r.editable;
    td.appendChild(inp);
    tr.appendChild(td);
  }

  marcarDesfase(tr, r);

  const ultimo = r.updated_at
    ? `${fecha(r.updated_at)} por ${r.updated_by}`
    : (r.created_at ? `${fecha(r.created_at)} por ${r.created_by}` : 'sin capturar');
  const tdCambio = celda(tr, ultimo, 'col-cambio-td');
  if (ultimo === 'sin capturar') tdCambio.classList.add('sin-capturar');

  return tr;
}

async function cargarObjetivos() {
  const anio = parseInt($('#f-anio').value, 10);
  const mes = parseInt($('#f-mes').value, 10);
  const tabla = $('#tabla-objetivos');

  for (const tb of [...tabla.tBodies].slice(1)) tb.remove();
  const cuerpo = tabla.tBodies[0];
  cuerpo.innerHTML = '';
  $('#estado-guardado').textContent = '';
  $('#exp-mes').textContent = MESES[mes - 1] || '—';
  $('#exp-anio').textContent = Number.isFinite(anio) ? anio : '';

  let data;
  try {
    data = await api(`objetivos?anio=${anio}&mes=${mes}`);
  } catch (err) { aviso(err.message, 'error'); return; }
  if (!ctx.sin_alta) aviso('');

  pintarSello(data);

  const porSeccion = ctx.rol === 'admin' || ctx.rol === 'rh';

  if (!porSeccion) {
    for (const r of data.rows) cuerpo.appendChild(renglonObjetivo(r, true));
  } else {
    const grupos = new Map();
    for (const r of data.rows) {
      const g = r.gerente || 'Sin gerente';
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(r);
    }

    for (const g of [...gruposPlegados]) if (!grupos.has(g)) gruposPlegados.delete(g);

    let n = 0;
    for (const nombre of [...grupos.keys()].sort((a, b) => a.localeCompare(b, 'es'))) {
      const tb = document.createElement('tbody');
      tb.className = 'grupo';
      tb.id = `grupo-${n += 1}`;
      tb.dataset.gerente = nombre;
      tb.classList.toggle('plegado', gruposPlegados.has(nombre));
      tb.appendChild(cabeceraGrupo(nombre, tb.id));
      for (const r of grupos.get(nombre)) tb.appendChild(renglonObjetivo(r, false));
      tabla.appendChild(tb);
    }
  }

  if (!data.rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.className = 'vacio';
    const fuerte = document.createElement('strong');
    fuerte.textContent = 'No hay asesores asignados a ti en este mes.';
    td.appendChild(fuerte);
    td.appendChild(document.createTextNode(
      'La reja se arma de las asignaciones vivas. Da de alta a tu equipo en «Mi equipo».'));
    tr.appendChild(td);
    cuerpo.appendChild(tr);
  }

  pintarFiltroAgencia(data.rows);
  aplicarFiltroAgencia();
  actualizarLado();
  actualizarCambios();
}

function pintarFiltroAgencia(filas) {
  const sel = $('#f-sucursal');
  const previo = sel.value;
  const enPantalla = [...new Set(filas.map((r) => r.sucursal))];
  const propias = (ctx.mis_sucursales && ctx.mis_sucursales.length) ? ctx.mis_sucursales : [];

  const lista = [...new Set([...propias, ...enPantalla])].sort();

  $('.filtro-agencia').hidden = !lista.length;
  if (!lista.length) return;

  const una = lista.length === 1;
  llenarSelect(sel, lista.map((x) => [x, x]), una ? null : 'Todas las agencias');
  sel.disabled = una;
  if (una) sel.value = lista[0];
  else if (previo && lista.includes(previo)) sel.value = previo;
}

function aplicarFiltroAgencia() {
  const elegida = $('.filtro-agencia').hidden ? '' : $('#f-sucursal').value;
  const cuerpo = $('#tabla-objetivos tbody');
  const todas = $$('#tabla-objetivos tbody tr[data-apv]');
  let visibles = 0;
  for (const tr of todas) {
    const cabe = !elegida || tr.dataset.sucursal === elegida;
    tr.hidden = !cabe;
    if (cabe) visibles += 1;
  }

  let vacio = $('#fila-filtro-vacio');
  if (todas.length && !visibles) {
    if (!vacio) {
      vacio = document.createElement('tr');
      vacio.id = 'fila-filtro-vacio';
      const td = document.createElement('td');
      td.colSpan = 8;
      td.className = 'vacio';
      vacio.appendChild(td);
      cuerpo.appendChild(vacio);
    }
    vacio.querySelector('td').textContent = `Ningún asesor en ${elegida} este mes.`;
    vacio.hidden = false;
  } else if (vacio) {
    vacio.hidden = true;
  }

  actualizarGrupos();
}

function actualizarGrupos() {
  for (const tb of $$('#tabla-objetivos tbody.grupo')) {
    const filas = Array.from(tb.querySelectorAll('tr[data-apv]')).filter((tr) => !tr.hidden);

    tb.hidden = !filas.length;
    if (!filas.length) continue;

    const faltan = filas.filter(sinCapturar).length;
    const sucios = filas.filter((tr) => tr.classList.contains('sucio')).length;

    tb.querySelector('.grupo-cuenta').textContent =
      `${filas.length} ${filas.length === 1 ? 'asesor' : 'asesores'}`;

    const falta = tb.querySelector('.grupo-falta');
    falta.textContent = faltan
      ? `${faltan} sin capturar`
      : (mesEditable ? 'completo' : 'quedo completo');
    falta.classList.toggle('grupo-completo', !faltan);

    const sucio = tb.querySelector('.grupo-sucio');
    sucio.textContent = sucios ? `${sucios} sin guardar` : '';
    sucio.hidden = !sucios;
  }
}

function sinCapturar(tr) {
  const cambio = tr.querySelector('.col-cambio-td');
  const vacios = Array.from(tr.querySelectorAll('input')).every((i) => !i.value || Number(i.value) === 0);
  return Boolean(cambio && cambio.classList.contains('sin-capturar') && vacios);
}

$('#f-sucursal').addEventListener('change', () => { aplicarFiltroAgencia(); actualizarLado(); });

function actualizarLado() {

  const filas = $$('#tabla-objetivos tbody tr[data-apv]').filter((tr) => !tr.hidden);

  $('#falta-titulo').textContent = mesEditable ? 'Sin capturar' : 'Quedó sin capturar';
  const falta = $('#falta-lista');
  falta.innerHTML = '';
  const pendientes = filas.filter(sinCapturar);

  if (!filas.length) {
    const li = document.createElement('li');
    li.textContent = '—';
    falta.appendChild(li);
  } else if (!pendientes.length) {
    const li = document.createElement('li');
    li.className = 'todo-listo';
    li.textContent = 'Todos tienen cifras.';
    falta.appendChild(li);
  } else {
    for (const tr of pendientes) {
      const li = document.createElement('li');
      li.textContent = tr.querySelector('.asesor-nombre').textContent;
      falta.appendChild(li);
    }
  }

  const totales = $('#totales');
  totales.innerHTML = '';
  for (const c of CAMPOS) {
    let suma = 0;
    for (const tr of filas) suma += valorRubro(tr, c);
    const dt = document.createElement('dt');
    dt.textContent = ETIQUETAS[c];
    const dd = document.createElement('dd');
    dd.textContent = suma.toLocaleString('es-MX');
    totales.appendChild(dt);
    totales.appendChild(dd);
  }
}

function actualizarCambios() {
  let sucios = 0;
  for (const tr of $$('#tabla-objetivos tbody tr[data-apv]')) {
    const cambio = Array.from(tr.querySelectorAll('input'))
      .some((i) => !i.disabled && i.value !== i.dataset.original);
    tr.classList.toggle('sucio', cambio);
    if (cambio) sucios += 1;
  }
  const cuenta = $('#cuenta-cambios');
  const btn = $('#btn-guardar');
  if (!mesEditable) {

    cuenta.textContent = 'No se puede escribir en un mes cerrado.';
    cuenta.classList.remove('hay-cambios');
    btn.hidden = true;
    actualizarGrupos();
    return;
  }
  btn.hidden = false;
  cuenta.textContent = sucios
    ? `${sucios} ${sucios === 1 ? 'asesor modificado' : 'asesores modificados'} sin guardar.`
    : 'Sin cambios por guardar.';
  cuenta.classList.toggle('hay-cambios', sucios > 0);
  btn.disabled = sucios === 0;
  actualizarGrupos();
}

$('#tabla-objetivos').addEventListener('keydown', (e) => {
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const inp = e.target;
  if (!(inp instanceof HTMLInputElement) || !inp.dataset.campo) return;
  e.preventDefault();
  const paso = e.key === 'ArrowUp' ? -1 : 1;

  const filas = $$('#tabla-objetivos tbody tr[data-apv]').filter(
    (tr) => !tr.hidden && !tr.parentElement.hidden && !tr.parentElement.classList.contains('plegado'));
  const i = filas.indexOf(inp.closest('tr'));
  const destino = filas[i + paso];
  if (!destino) return;
  const campo = destino.querySelector(`input[data-campo="${inp.dataset.campo}"]`);
  if (campo && !campo.disabled) { campo.focus(); campo.select(); }
});

$('#tabla-objetivos').addEventListener('input', (e) => {
  if (!(e.target instanceof HTMLInputElement) || !e.target.dataset.campo) return;

  pintarCalculados(e.target.closest('tr'));
  actualizarCambios();
  actualizarLado();
});

$('#btn-guardar').addEventListener('click', async () => {
  const anio = parseInt($('#f-anio').value, 10);
  const mes = parseInt($('#f-mes').value, 10);

  const filas = [];
  for (const tr of $$('#tabla-objetivos tbody tr')) {
    if (!tr.dataset.apv || tr.classList.contains('cerrado')) continue;
    if (!tr.classList.contains('sucio')) continue;
    const fila = { apv_id: Number(tr.dataset.apv), sucursal: tr.dataset.sucursal };

    for (const inp of tr.querySelectorAll('input')) fila[inp.dataset.campo] = Number(inp.value || 0);
    filas.push(fila);
  }
  if (!filas.length) { $('#estado-guardado').textContent = 'Nada que guardar.'; return; }

  const btn = $('#btn-guardar');
  btn.disabled = true;
  $('#estado-guardado').textContent = 'Guardando...';
  $('#estado-guardado').classList.remove('malo');

  try {
    const r = await api('objetivos', { method: 'PUT', body: { anio, mes, filas } });
    if (r.rechazados.length) {

      const detalle = r.rechazados.map((x) => `${x.sucursal || ''} ${x.motivo}`).join('; ');
      $('#estado-guardado').textContent = `Guardados ${r.guardados}, rechazados ${r.rechazados.length}.`;
      $('#estado-guardado').classList.add('malo');
      aviso(`Rechazados ${r.rechazados.length}: ${detalle}`, 'error');
    } else {
      $('#estado-guardado').textContent = '';
      toast(`Guardados ${r.guardados} ${r.guardados === 1 ? 'asesor' : 'asesores'}.`);
    }
    await cargarObjetivos();
  } catch (err) {
    $('#estado-guardado').textContent = err.message;
    $('#estado-guardado').classList.add('malo');
    btn.disabled = false;
  }
});

function puedeMoverEquipo() {
  return ctx.rol === 'admin' || ctx.rol === 'rh';
}

async function cargarApv() {
  const cuerpo = $('#tabla-apv tbody');
  cuerpo.innerHTML = '';
  let data;
  try { data = await api('apv'); } catch (err) { aviso(err.message, 'error'); return; }

  for (const r of data.rows) {
    const tr = document.createElement('tr');

    tr.dataset.asesor = quitarAcentos(r.asesor);
    tr.dataset.gerente = r.gerente;
    tr.dataset.sucursal = r.sucursal;

    celda(tr, r.asesor);
    celda(tr, r.sucursal);
    celda(tr, r.gerente);
    celda(tr, fecha(r.vigente_desde));

    const td = document.createElement('td');
    const acciones = document.createElement('div');
    acciones.className = 'acciones-celda';
    acciones.appendChild(boton('Historial', 'btn btn-fantasma', () => verHistorial(r.apv_id, r.asesor)));

    if (puedeMoverEquipo()) {
      acciones.appendChild(boton('Dar de baja', 'btn btn-peligro', () => pedirBaja(tr, r)));
    }
    td.appendChild(acciones);
    tr.appendChild(td);

    cuerpo.appendChild(tr);
  }

  if (!data.rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'vacio';
    const fuerte = document.createElement('strong');
    fuerte.textContent = 'Todavía no tienes asesores asignados.';
    td.appendChild(fuerte);
    td.appendChild(document.createTextNode(puedeMoverEquipo()
      ? 'Dalos de alta arriba y aparecerán en el mes.'
      : 'Las altas las hace Recursos Humanos; en cuanto te asignen a alguien aparece aquí.'));
    tr.appendChild(td);
    cuerpo.appendChild(tr);
  }

  pintarFiltrosApv(data.rows);
}

const UMBRAL_FILTROS_APV = 4;

function quitarAcentos(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function pintarFiltrosApv(filas) {
  const barra = $('#filtros-apv');
  if (filas.length < UMBRAL_FILTROS_APV) { barra.hidden = true; return; }
  barra.hidden = false;

  const gerentes_apv = [...new Set(filas.map((r) => r.gerente))].sort();
  const agencias_apv = [...new Set(filas.map((r) => r.sucursal))].sort();

  const selGerente = $('#apv-filtro-gerente');
  const selAgencia = $('#apv-filtro-agencia');

  const prevGer = selGerente.value;
  const prevAg  = selAgencia.value;

  llenarSelect(selGerente, gerentes_apv.map((g) => [g, g]),
    gerentes_apv.length > 1 ? 'Todos los gerentes' : null);
  llenarSelect(selAgencia, agencias_apv.map((a) => [a, a]),
    agencias_apv.length > 1 ? 'Todas las agencias' : null);

  if (gerentes_apv.length === 1) { selGerente.value = gerentes_apv[0]; selGerente.disabled = true; }
  else { selGerente.disabled = false; if (prevGer && gerentes_apv.includes(prevGer)) selGerente.value = prevGer; }

  if (agencias_apv.length === 1) { selAgencia.value = agencias_apv[0]; selAgencia.disabled = true; }
  else { selAgencia.disabled = false; if (prevAg && agencias_apv.includes(prevAg)) selAgencia.value = prevAg; }

  filtrarApv();
}

function filtrarApv() {
  const barra = $('#filtros-apv');
  if (barra.hidden) return;

  const texto   = quitarAcentos($('#apv-busca').value.trim());
  const gerente = $('#apv-filtro-gerente').value;
  const agencia = $('#apv-filtro-agencia').value;

  const filas = $$('#tabla-apv tbody tr');
  let visibles = 0;
  let total    = 0;

  for (const tr of filas) {

    if (!tr.dataset.asesor) continue;
    total++;
    const cabeTexto   = !texto   || tr.dataset.asesor.includes(texto);
    const cabeGerente = !gerente || tr.dataset.gerente === gerente;
    const cabeAgencia = !agencia || tr.dataset.sucursal === agencia;
    const cabe = cabeTexto && cabeGerente && cabeAgencia;
    tr.hidden = !cabe;
    if (cabe) visibles++;
  }

  const cuenta = $('#apv-filtro-cuenta');
  if (texto || gerente || agencia) {
    cuenta.textContent = visibles === total
      ? `${total} ${total === 1 ? 'asesor' : 'asesores'}`
      : `${visibles} de ${total} ${total === 1 ? 'asesor' : 'asesores'}`;
  } else {
    cuenta.textContent = '';
  }
}

$('#apv-busca').addEventListener('input', filtrarApv);
$('#apv-filtro-gerente').addEventListener('change', filtrarApv);
$('#apv-filtro-agencia').addEventListener('change', filtrarApv);

function pedirBaja(trAsesor, r) {
  const previa = $('#tabla-apv tr.confirma');
  if (previa) previa.remove();

  const tr = document.createElement('tr');
  tr.className = 'confirma';
  const td = document.createElement('td');
  td.colSpan = 5;

  const caja = document.createElement('div');
  caja.className = 'confirma-caja';
  const p = document.createElement('p');
  p.textContent = `Cerrar el periodo de ${r.asesor} en ${r.sucursal}. `
    + 'Sus objetivos ya cargados se conservan, pero deja de aparecer en la reja del mes.';
  caja.appendChild(p);

  const motivo = document.createElement('input');
  motivo.type = 'text';
  motivo.placeholder = 'Motivo de la baja';
  motivo.setAttribute('aria-label', 'Motivo de la baja');
  caja.appendChild(motivo);

  caja.appendChild(boton('Dar de baja', 'btn btn-peligro btn-peligro-firme', async () => {
    try {
      await api(`asignaciones/${r.asignacion_id}/cerrar`, { method: 'POST', body: { motivo: motivo.value } });
      toast(`${r.asesor} dado de baja en ${r.sucursal}.`);
      await cargarApv();
      await cargarObjetivos();
    } catch (err) { aviso(err.message, 'error'); }
  }));
  caja.appendChild(boton('Cancelar', 'btn btn-fantasma', () => tr.remove()));

  td.appendChild(caja);
  tr.appendChild(td);
  trAsesor.after(tr);
  motivo.focus();
}

async function verHistorial(apvId, asesor) {
  let data;
  try {
    data = await api(`apv/${apvId}/historial`);
  } catch (err) { aviso(err.message, 'error'); return; }

  $('#dlg-hist-titulo').textContent = `Historial de ${asesor}`;
  const cuerpo = $('#dlg-hist-cuerpo');
  cuerpo.innerHTML = '';

  if (!data.rows.length) {
    const p = document.createElement('p');
    p.className = 'hist-sin-obj';

    p.textContent = 'No hay periodos que puedas ver de este asesor.';
    cuerpo.appendChild(p);
  }

  for (const h of data.rows) {
    cuerpo.appendChild(bloquePeriodo(h));
  }

  $('#dlg-historial').showModal();
}

function bloquePeriodo(h) {
  const caja = document.createElement('section');
  caja.className = h.vigente_hasta ? 'hist-periodo hist-cerrado' : 'hist-periodo';

  const cabeza = document.createElement('div');
  cabeza.className = 'hist-cabeza';
  const ag = document.createElement('span');
  ag.className = 'hist-agencia';
  ag.textContent = h.sucursal;
  cabeza.appendChild(ag);
  const ger = document.createElement('span');
  ger.className = 'hist-gerente';
  ger.textContent = h.gerente;
  cabeza.appendChild(ger);
  caja.appendChild(cabeza);

  caja.appendChild(hito(`Entró al equipo el `, fecha(h.vigente_desde),
    h.created_by ? ` · lo dio de alta ${h.created_by}` : ''));

  caja.appendChild(tablaObjetivos(h.objetivos));

  if (h.vigente_hasta) {
    caja.appendChild(hito('Salió del equipo el ', fecha(h.vigente_hasta),
      (h.motivo_baja ? ` · ${h.motivo_baja}` : '')
      + (h.cerrada_by ? ` · lo cerró ${h.cerrada_by}` : '')));
  } else {
    const p = document.createElement('p');
    p.className = 'hist-hito hist-vive';
    p.textContent = 'Sigue en este equipo.';
    caja.appendChild(p);
  }
  return caja;
}

function hito(antes, cuando, despues) {
  const p = document.createElement('p');
  p.className = 'hist-hito';
  p.appendChild(document.createTextNode(antes));
  const f = document.createElement('strong');
  f.textContent = cuando;
  p.appendChild(f);
  if (despues) p.appendChild(document.createTextNode(despues));
  return p;
}

function tablaObjetivos(filas) {
  if (!filas || !filas.length) {
    const p = document.createElement('p');
    p.className = 'hist-sin-obj';
    p.textContent = 'Sin objetivos capturados en este periodo.';
    return p;
  }

  const tabla = document.createElement('table');
  tabla.className = 'hist-obj';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const t of ['Mes', ...CAMPOS.map((c) => ETIQUETAS[c])]) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = t;
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tabla.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const o of filas) {
    const tr = document.createElement('tr');

    if (o.vigente_al_cierre) tr.className = 'hist-cuenta';

    const td = document.createElement('td');
    td.textContent = `${MESES[o.mes - 1]} ${o.anio}`;
    if (o.vigente_al_cierre) {
      const m = document.createElement('span');
      m.className = 'hist-marca';
      m.textContent = 'CUENTA';
      m.title = 'Este equipo seguía vigente el último día del mes, así que es el '
        + 'objetivo que Power BI reporta.';
      td.appendChild(m);
    }
    tr.appendChild(td);
    for (const c of CAMPOS) {
      const tdn = document.createElement('td');
      tdn.textContent = o[c] == null ? '—' : o[c];
      tr.appendChild(tdn);
    }
    tbody.appendChild(tr);

    for (const c of (o.cambios || []).slice(1)) {
      tbody.appendChild(renglonAnterior(c));
    }
  }
  tabla.appendChild(tbody);
  return tabla;
}

function renglonAnterior(c) {
  const tr = document.createElement('tr');
  tr.className = 'hist-antes';

  const td = document.createElement('td');
  const flecha = document.createElement('span');
  flecha.className = 'hist-flecha';
  flecha.textContent = '↳';
  td.appendChild(flecha);
  td.appendChild(document.createTextNode(
    `${c.accion === 'alta' ? 'Alta' : 'Antes'} · ${fechaHora(c.at)}`
    + (c.por_usuario ? ` · ${c.por_usuario}` : '')));
  tr.appendChild(td);

  for (const campo of CAMPOS) {
    const tdn = document.createElement('td');
    tdn.textContent = c[campo] == null ? '—' : c[campo];
    tr.appendChild(tdn);
  }
  return tr;
}

$('#dlg-hist-cerrar').addEventListener('click', () => { $('#dlg-historial').close(); });

function avisoNombre(msg, tono = 'info') {
  const el = $('#aviso-nombre');
  el.textContent = msg || '';
  el.className = `nota nota-${tono}`;
  el.hidden = !msg;
}

let candidatosApv = [];

function bloquearAltaApv(razon) {
  const btn = $('#form-apv button[type=submit]');
  btn.disabled = Boolean(razon);
  btn.title = razon || '';
}

function agenciasDelAlta() {
  if (ctx.rol === 'admin') {
    const g = gerentes.find((x) => x.gerente_id === Number($('#apv-gerente').value));
    return g ? g.sucursales : null;
  }
  if (ctx.rol === 'rh') {

    const g = gerentes.find((x) => x.gerente_id === Number($('#apv-gerente').value));
    const suyas = ctx.mis_sucursales || [];
    if (!g || g.sucursales === null) return suyas.length ? suyas : null;
    return g.sucursales.filter((x) => suyas.includes(x));
  }
  return ctx.mis_sucursales;
}

function pintarAgenciasAlta() {
  const sel = $('#apv-sucursal');
  const suyas = agenciasDelAlta();
  const lista = suyas === null ? sucursales.map((x) => x.SUCURSAL) : suyas;

  const una = lista.length === 1;
  llenarSelect(sel, lista.map((x) => [x, x]), una ? null : '— elige la agencia —');
  sel.disabled = una;
  if (una) sel.value = lista[0];

  if (!lista.length) {
    avisoNombre('Nómina no ubica a ese gerente en ninguna agencia, así que no hay dónde dar de '
      + 'alta. Avísale a un administrador.', 'aviso');
    llenarSelect($('#apv-nombre'), []);
    bloquearAltaApv('Sin agencias');
    return;
  }
  cargarCandidatosApv(sel.value);
}

function etiquetaCandidato(r) {
  const base = `${r.ASESOR} — ${r.PUESTO}`;
  return r.EN_CRM === false ? `${base} · OJO: no aparece en el reporte` : base;
}

async function cargarCandidatosApv(sucursal) {
  const sel = $('#apv-nombre');
  candidatosApv = [];
  llenarSelect(sel, []);
  sel.disabled = true;
  bloquearAltaApv('Sin asesores por dar de alta');
  avisoNombre('');
  if (!sucursal) return;

  let data;
  try {
    data = await api(`candidatos?sucursal=${encodeURIComponent(sucursal)}`);
  } catch (err) {
    avisoNombre(`No se pudo leer el padrón de nómina (${err.message}). El alta está limitada al `
      + 'padrón, así que queda detenida hasta que se resuelva.', 'error');
    return;
  }
  if (!data.disponible) {
    avisoNombre(`El padrón de nómina no está disponible. ${data.motivo || 'La base no dijo por qué.'}`
      + (data.detalle ? ` [SQL ${data.sql}: ${data.detalle}]` : '')
      + ' El alta está limitada al padrón, así que queda detenida hasta que se resuelva.', 'error');
    return;
  }

  candidatosApv = data.rows;
  llenarSelect(sel, data.rows.map((r) => [r.ASESOR, etiquetaCandidato(r)]),
    data.rows.length ? '— elige al asesor —' : null);
  sel.disabled = !data.rows.length;
  bloquearAltaApv(data.rows.length ? '' : 'Sin asesores por dar de alta');

  avisoNombre(data.rows.length
    ? `${data.rows.length} APV en ${sucursal} según nómina, sin gerente asignado.`
    : `Nómina no reporta APV sin asignar en ${sucursal}. Si falta alguien, hay que cargarlo `
      + 'primero en nómina.');
}

$('#apv-gerente').addEventListener('change', pintarAgenciasAlta);
$('#form-apv [name=sucursal]').addEventListener('change', (e) => cargarCandidatosApv(e.target.value));

$('#apv-nombre').addEventListener('change', (e) => {
  const r = candidatosApv.find((x) => x.ASESOR === e.target.value);
  if (r && r.EN_CRM === false) {
    avisoNombre(`«${r.ASESOR}» no aparece en ninguna de las cuatro fuentes del reporte. Se puede `
      + 'dar de alta, pero sus objetivos van a salir en ceros en Power BI hasta que el nombre '
      + 'coincida allá.', 'aviso');
  }
});

$('#form-apv').addEventListener('submit', async (e) => {
  e.preventDefault();
  aviso('');
  $('#duplicado').hidden = true;

  const fd = new FormData(e.target);
  const cuerpo = { nombre: $('#apv-nombre').value, sucursal: $('#apv-sucursal').value };
  if (ctx.rol === 'admin' || ctx.rol === 'rh') cuerpo.gerente_id = Number(fd.get('gerente_id'));

  try {
    await api('apv', { method: 'POST', body: cuerpo });
    e.target.reset();

    pintarAgenciasAlta();
    toast(`${cuerpo.nombre} dado de alta en ${cuerpo.sucursal}.`);
    await cargarApv();
    await cargarObjetivos();
  } catch (err) {

    if (err.status === 409 && err.data && err.data.yaExiste) {
      pendienteVincular = { apv_id: err.data.apv_id, sucursal: cuerpo.sucursal, gerente_id: cuerpo.gerente_id };
      const donde = (err.data.asignaciones || [])
        .map((a) => `${a.sucursal} (${a.gerente})`).join(', ') || 'sin agencia activa';
      $('#duplicado-texto').textContent =
        `«${err.data.asesor}» ya existe y hoy está en: ${donde}. `
        + `Si es la misma persona, se le agrega ${cuerpo.sucursal} en vez de crear un segundo registro.`;
      $('#duplicado').hidden = false;
      return;
    }
    aviso(err.message, 'error');
  }
});

$('#btn-cancelar-dup').addEventListener('click', () => {
  pendienteVincular = null;
  $('#duplicado').hidden = true;
});

$('#btn-vincular').addEventListener('click', async () => {
  if (!pendienteVincular) return;
  try {
    await api('asignaciones', { method: 'POST', body: pendienteVincular });
    toast(`Agregado a ${pendienteVincular.sucursal}.`);
    pendienteVincular = null;
    $('#duplicado').hidden = true;
    $('#form-apv').reset();
    await cargarApv();
    await cargarObjetivos();
  } catch (err) { aviso(err.message, 'error'); }
});

async function cargarGerentes() {
  let data;
  let accesos;
  try {
    [data, accesos] = await Promise.all([api('gerentes'), leerAccesos()]);
  } catch (err) {
    avisoListaGerentes(`No se pudo leer el catálogo de gerentes: ${err.message}`, 'error');
    return;
  }
  gerentes = data.rows;

  if (data.motivo) {
    avisoListaGerentes(`${data.motivo}${data.detalle ? ` [SQL ${data.sql}: ${data.detalle}]` : ''}`, 'aviso');
  } else if (data.alcance === 'rh') {
    avisoListaGerentes(gerentes.length
      ? `${gerentes.length} gerentes en tus agencias. Solo estos aparecen aquí y en el alta de APV.`
      : 'Nómina no ubica a ningún gerente en tus agencias. Si falta alguno, avísale a un administrador.');
  } else {
    avisoListaGerentes('');
  }

  const pares = gerentes.filter((g) => g.activo).map((g) => [g.gerente_id, g.nombre]);
  llenarSelect($('#form-apv select[name=gerente_id]'), pares);
  llenarSelect($('#form-apertura select[name=gerente_id]'), pares);

  pintarAgenciasAlta();

  const cuerpo = $('#tabla-gerentes tbody');
  if (!cuerpo) return;
  cuerpo.innerHTML = '';
  for (const g of gerentes) {
    const tr = document.createElement('tr');
    celda(tr, g.usuario);
    celda(tr, g.nombre);
    const td = document.createElement('td');
    const estado = document.createElement('span');
    estado.className = `estado-punto ${g.activo ? 'estado-si' : 'estado-no'}`;
    estado.textContent = g.activo ? 'Activo' : 'Inactivo';
    td.appendChild(estado);
    tr.appendChild(td);

    const acceso = accesos ? accesos.get(g.usuario.toUpperCase()) : undefined;
    const tdAcceso = document.createElement('td');
    const punto = document.createElement('span');
    if (!accesos) {
      tdAcceso.textContent = '—';
    } else {
      punto.className = `estado-punto ${acceso ? 'estado-si' : 'estado-no'}`;
      punto.textContent = !acceso ? 'Sin acceso' : (acceso.activo ? 'Con acceso' : 'Deshabilitado');
      tdAcceso.appendChild(punto);
    }
    tr.appendChild(tdAcceso);

    const tdAcc = document.createElement('td');
    const acciones = document.createElement('div');
    acciones.className = 'acciones-celda';
    if (accesos && !acceso) {

      acciones.appendChild(boton('Dar acceso', 'btn', () => darAcceso(g)));
    } else {
      acciones.appendChild(boton('Restablecer contraseña', 'btn btn-peligro',
        () => restablecerPassword(g)));
    }
    if (g.activo) {
      acciones.appendChild(boton('Dar de baja', 'btn btn-peligro', () => pedirBajaGerente(tr, g)));
    } else {
      acciones.appendChild(boton('Reactivar', 'btn', () => reactivarGerente(g)));
    }
    tdAcc.appendChild(acciones);
    tr.appendChild(tdAcc);

    cuerpo.appendChild(tr);
  }
}

function pedirBajaGerente(trGerente, g) {
  const previa = $('#tabla-gerentes tr.confirma');
  if (previa) previa.remove();

  const tr = document.createElement('tr');
  tr.className = 'confirma';
  const td = document.createElement('td');
  td.colSpan = 5;

  const caja = document.createElement('div');
  caja.className = 'confirma-caja';
  const p = document.createElement('p');
  p.textContent = `Dar de baja a ${g.nombre}. Deja de capturar y sale de los combos; `
    + 'sus objetivos ya cargados se conservan. Su acceso a otras herramientas no cambia.';
  caja.appendChild(p);

  caja.appendChild(boton('Dar de baja', 'btn btn-peligro btn-peligro-firme', async () => {
    try {
      await api(`gerentes/${g.gerente_id}/baja`, { method: 'POST', body: {} });
      toast(`${g.nombre} dado de baja.`);
      await cargarGerentes();
    } catch (err) { aviso(err.message, 'error'); }
  }));
  caja.appendChild(boton('Cancelar', 'btn btn-fantasma', () => tr.remove()));

  td.appendChild(caja);
  tr.appendChild(td);
  trGerente.after(tr);
}

async function reactivarGerente(g) {
  try {
    await api(`gerentes/${g.gerente_id}/reactivar`, { method: 'POST', body: {} });
    toast(`${g.nombre} reactivado.`);
    await cargarGerentes();
  } catch (err) { aviso(err.message, 'error'); }
}

async function leerAccesos() {
  try {
    const res = await fetch('/api/accesos');
    if (!res.ok) return null;
    const d = await res.json();
    return new Map((d.miembros || []).map((m) => [String(m.usuario).toUpperCase(), m]));
  } catch {
    return null;
  }
}

async function darAcceso(g) {
  const ok = confirm(`Dar acceso a Objetivos APV a ${g.nombre} (${g.usuario}).\n\n`
    + 'Si ya tiene usuario en otra herramienta interna, conserva su contraseña. '
    + 'Si no, se le genera una y se muestra una sola vez.');
  if (!ok) return;

  try {
    const res = await fetch('/api/alta-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: g.usuario, rol: 'user' }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { aviso(d.error || 'No se pudo dar acceso', 'error'); return; }

    if (d.ya_existia) {
      toast(`${g.nombre} ya tenía usuario en la central; entra con la contraseña que ya usa.`);
    } else {
      mostrarAcceso({
        titulo: 'Acceso creado',
        lead: `${g.nombre} ya puede entrar a Objetivos APV.`,
        usuario: d.usuario,
        password: d.password,
      });
    }
    await cargarGerentes();
  } catch (err) {
    aviso(`No se pudo dar acceso: ${err.message}`, 'error');
  }
}

async function restablecerPassword(g) {
  const quien = g.nombre ? `${g.nombre} (${g.usuario})` : g.usuario;
  const ok = confirm(
    `Restablecer la contraseña de ${quien}.\n\n`
    + 'La actual deja de servir en ese momento.\n\n'
    + 'OJO: la contraseña es de la PERSONA, no de esta app. También cambia la '
    + 'que usa en las demás herramientas internas.');
  if (!ok) return;

  try {
    const res = await fetch('/api/restablecer-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: g.usuario }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { aviso(d.error || 'No se pudo restablecer', 'error'); return; }

    mostrarAcceso({
      titulo: 'Contraseña restablecida',
      lead: `${g.nombre || g.usuario} entra con esta contraseña nueva.`,
      usuario: d.usuario,
      password: d.password,
      afectaTodas: d.afecta_todas_las_apps,
    });
  } catch (err) {
    aviso(`No se pudo restablecer: ${err.message}`, 'error');
  }
}

function mostrarAcceso({ titulo, lead, usuario, password, afectaTodas = false }) {
  $('#dlg-titulo').textContent = titulo;
  $('#dlg-lead').textContent = lead;
  $('#dlg-usuario').textContent = usuario;
  $('#dlg-password').textContent = password;
  $('#dlg-nota').textContent =
    'Cópiala y entrégasela ahora: no se vuelve a mostrar. Si se pierde, se restablece y se genera otra.'
    + (afectaTodas ? ' Ojo: también cambió su contraseña en las demás herramientas internas.' : '');
  $('#dlg-copiar').textContent = 'Copiar';
  $('#dlg-acceso').showModal();
}

$('#dlg-copiar').addEventListener('click', async (e) => {
  const texto = `Usuario: ${$('#dlg-usuario').textContent}\nContraseña: ${$('#dlg-password').textContent}`;
  try {
    await navigator.clipboard.writeText(texto);
    e.target.textContent = 'Copiado';
  } catch {

    e.target.textContent = 'Selecciónala y cópiala';
  }
});

$('#dlg-acceso').addEventListener('close', () => {
  $('#dlg-usuario').textContent = '';
  $('#dlg-password').textContent = '';
});

function avisoListaGerentes(msg, tono = 'info') {
  const el = $('#aviso-lista-gerentes');
  if (!el) return;
  el.textContent = msg || '';
  el.className = `nota nota-${tono}`;
  el.hidden = !msg;
}

function avisoGerente(msg, tono = 'info') {
  const el = $('#aviso-gerente');
  el.textContent = msg || '';
  el.className = `nota nota-${tono}`;
  el.hidden = !msg;
}

let candidatosGerente = [];

function bloquearAltaGerente(razon) {
  const btn = $('#form-gerente button[type=submit]');
  btn.disabled = Boolean(razon);
  btn.title = razon || '';
}

async function cargarCandidatosGerente() {
  const sel = $('#ger-nombre');
  if (!sel) return;
  candidatosGerente = [];
  llenarSelect(sel, []);
  sel.disabled = true;
  bloquearAltaGerente('Sin gerentes por registrar');

  let data;
  try {
    data = await api('candidatos-gerente');
  } catch (err) {
    avisoGerente(`No se pudo leer el padrón de gerentes (${err.message}). El alta está limitada al `
      + 'padrón, así que queda detenida hasta que se resuelva.', 'error');
    return;
  }
  if (!data.disponible) {
    avisoGerente(`El padrón de gerentes no está disponible. ${data.motivo || 'La base no dijo por qué.'}`
      + (data.detalle ? ` [SQL ${data.sql}: ${data.detalle}]` : '')
      + ' El alta está limitada al padrón, así que queda detenida hasta que se resuelva.', 'error');
    return;
  }

  candidatosGerente = data.rows;
  llenarSelect(sel, data.rows.map((r) => [r.NOMBRE, `${r.NOMBRE} — ${r.PUESTO} · ${r.DONDE}`]),
    data.rows.length ? '— elige a la persona —' : null);
  sel.disabled = !data.rows.length;
  bloquearAltaGerente(data.rows.length ? '' : 'Sin gerentes por registrar');

  avisoGerente(data.rows.length
    ? `${data.rows.length} gerentes comerciales vigentes en nómina, sin registrar aquí. El usuario de la central se teclea aparte.`
    : 'Nómina no reporta gerentes comerciales pendientes de registrar.');
}

$('#ger-nombre').addEventListener('change', (e) => {
  const elegido = candidatosGerente.find((r) => r.NOMBRE === e.target.value);
  if (elegido) {
    avisoGerente(`${elegido.PUESTO} en ${elegido.DONDE}. Falta su usuario de la central.`);
  } else if (candidatosGerente.length) {
    avisoGerente(`${candidatosGerente.length} gerentes comerciales vigentes en nómina, sin registrar aquí. El usuario de la central se teclea aparte.`);
  }
});

$('#form-gerente').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const nombre = String(fd.get('nombre') || '').trim();
  const usuario = String(fd.get('usuario') || '').trim();
  const rol = fd.get('rol') === 'admin' ? 'admin' : 'user';

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const res = await fetch('/api/alta-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({ usuario, rol, nombre }),
    });
    const acceso = await res.json().catch(() => ({}));
    if (!res.ok) { aviso(acceso.error || 'No se pudo crear el acceso', 'error'); return; }

    try {
      await api('gerentes', { method: 'POST', body: { usuario, nombre } });
    } catch (err) {

      const yaRegistrado = err.status === 409
        && gerentes.some((g) => g.usuario.toUpperCase() === usuario.toUpperCase());
      if (!yaRegistrado) throw err;
    }

    if (acceso.ya_existia) {

      toast(`${nombre} ya tenía usuario en la central; entra con la contraseña que ya usa.`);
    } else {
      mostrarAcceso({
        titulo: 'Acceso creado',
        lead: `${nombre} ya puede entrar a Objetivos APV.`,
        usuario: acceso.usuario,
        password: acceso.password,
      });
    }

    e.target.reset();
    avisoGerente('');
    await cargarGerentes();
    await cargarCandidatosGerente();
  } catch (err) {
    aviso(`El acceso se creó, pero no se pudo registrar al gerente: ${err.message}. `
      + 'Vuelve a intentarlo con los mismos datos; no se duplica nada.', 'error');
  } finally {
    btn.disabled = false;
  }
});

let alcancesRh = new Map();

async function cargarUsuariosRh() {
  const cuerpo = $('#tabla-rh tbody');
  if (!cuerpo) return;

  const opciones = sucursales.map((s) => [s.SUCURSAL, s.SUCURSAL]);
  llenarSelect($('#form-rh select[name=sucursal]'), opciones);
  llenarSelect($('#dlg-rh-sucursal'), opciones);

  let data;
  try { data = await api('usuarios-rh'); } catch (err) { aviso(err.message, 'error'); return; }

  alcancesRh = new Map();
  for (const r of data.rows) {
    if (!alcancesRh.has(r.usuario)) {
      alcancesRh.set(r.usuario, { usuario: r.usuario, agencias: [], desde: r.created_at });
    }
    const g = alcancesRh.get(r.usuario);
    g.agencias.push(r.sucursal);

    if (String(r.created_at) < String(g.desde)) g.desde = r.created_at;
  }

  for (const r of (data.sinAgencias || [])) {
    if (!alcancesRh.has(r.usuario)) {
      alcancesRh.set(r.usuario, { usuario: r.usuario, agencias: [], desde: r.created_at });
    }
  }

  cuerpo.innerHTML = '';
  for (const g of alcancesRh.values()) {
    const tr = document.createElement('tr');
    celda(tr, g.usuario);

    const tdAg = document.createElement('td');
    const chips = document.createElement('div');
    chips.className = 'chips-celda';
    if (g.agencias.length) {
      for (const suc of g.agencias) {
        const chip = document.createElement('span');
        chip.className = 'chip-agencia';
        chip.textContent = suc;
        chips.appendChild(chip);
      }
    } else {
      const nada = document.createElement('span');
      nada.className = 'sin-agencias';
      nada.textContent = 'Sin agencias: entra, pero no ve ningún APV.';
      chips.appendChild(nada);
    }
    tdAg.appendChild(chips);
    tr.appendChild(tdAg);

    celda(tr, fecha(g.desde));

    const td = document.createElement('td');
    const acciones = document.createElement('div');
    acciones.className = 'acciones-celda';
    acciones.appendChild(boton('Editar agencias', 'btn', () => abrirEditorRh(g)));

    acciones.appendChild(boton('Restablecer contraseña', 'btn btn-peligro',
      () => restablecerPassword({ usuario: g.usuario })));
    td.appendChild(acciones);
    tr.appendChild(td);
    cuerpo.appendChild(tr);
  }

  if (!alcancesRh.size) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'vacio';
    const fuerte = document.createElement('strong');
    fuerte.textContent = 'Nadie de RH está dado de alta.';
    td.appendChild(fuerte);
    td.appendChild(document.createTextNode(
      'Quien se dé de alta aquí administra los equipos de sus agencias, y solo de esas.'));
    tr.appendChild(td);
    cuerpo.appendChild(tr);
  }
}

let editandoRh = null;

function abrirEditorRh(g) {
  editandoRh = g.usuario;
  $('#dlg-rh-titulo').textContent = `Agencias de ${g.usuario}`;
  $('#dlg-rh-lead').textContent = g.agencias.length
    ? `Hoy administra ${g.agencias.join(', ')}.`
    : 'Hoy no administra ninguna agencia, así que no ve ningún APV.';

  const sel = $('#dlg-rh-sucursal');
  llenarSelect(sel, sucursales.map((s) => [s.SUCURSAL, s.SUCURSAL]));

  const enCatalogo = new Set(Array.from(sel.options).map((o) => o.value));
  const fueraDeCatalogo = g.agencias.filter((suc) => !enCatalogo.has(suc));
  for (const suc of fueraDeCatalogo) {
    const o = document.createElement('option');
    o.value = suc;
    o.textContent = `${suc} — fuera del catálogo`;
    sel.appendChild(o);
  }

  const suyas = new Set(g.agencias);
  for (const o of sel.options) o.selected = suyas.has(o.value);

  avisoEditorRh(fueraDeCatalogo.length
    ? `${fueraDeCatalogo.join(', ')} ya no está en el catálogo de agencias, pero sigue asignada. `
      + 'Si la desmarcas, desde aquí ya no se va a poder volver a poner.'
    : '');
  $('#dlg-rh').showModal();
}

function avisoEditorRh(msg, tono = 'aviso') {
  const el = $('#dlg-rh-aviso');
  el.textContent = msg || '';
  el.className = `nota nota-${tono}`;
  el.hidden = !msg;
}

$('#dlg-rh-cancelar').addEventListener('click', () => $('#dlg-rh').close());

$('#dlg-rh').addEventListener('close', () => { editandoRh = null; });

$('#form-rh-editar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = editandoRh;
  if (!usuario) return;

  const elegidas = Array.from($('#dlg-rh-sucursal').selectedOptions).map((o) => o.value);
  const antes = (alcancesRh.get(usuario) || { agencias: [] }).agencias;
  const quita = antes.filter((suc) => !elegidas.includes(suc));
  const pone = elegidas.filter((suc) => !antes.includes(suc));

  if (!quita.length && !pone.length) {
    $('#dlg-rh').close();
    toast(`Las agencias de ${usuario} quedaron igual.`);
    return;
  }

  if (!elegidas.length) {
    if (!confirm(`${usuario} se va a quedar SIN NINGUNA agencia.\n\n`
      + 'Va a poder entrar, pero no verá ningún APV. Su acceso no se toca: eso se '
      + 'hace en la central.')) return;
  } else if (quita.length) {
    if (!confirm(`Quitarle ${quita.join(', ')} a ${usuario}.\n\n`
      + 'Deja de ver y de tocar los APV de esas agencias. Queda registrado.')) return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const r = await api(`usuarios-rh/${encodeURIComponent(usuario)}/sucursales`,
      { method: 'PUT', body: { sucursales: elegidas } });

    const partes = [];
    if (r.agregadas && r.agregadas.length) partes.push(`ahora cubre ${r.agregadas.join(', ')}`);
    if (r.quitadas && r.quitadas.length) partes.push(`ya no cubre ${r.quitadas.join(', ')}`);
    toast(`${usuario}: ${partes.join('; ')}.`);

    $('#dlg-rh').close();
    await cargarUsuariosRh();
  } catch (err) {

    avisoEditorRh(`No se guardó nada: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
});

$('#form-rh').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const usuario = String(fd.get('usuario') || '').trim();

  const elegidas = Array.from($('#rh-sucursal').selectedOptions).map((o) => o.value);
  if (!elegidas.length) { aviso('Elige al menos una agencia.', 'aviso'); return; }
  const lista = elegidas.join(', ');

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const res = await fetch('/api/alta-usuario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, rol: 'rh' }),
    });
    const acceso = await res.json().catch(() => ({}));
    if (!res.ok) { aviso(acceso.error || 'No se pudo crear el acceso', 'error'); return; }

    const r = await api('usuarios-rh', { method: 'POST', body: { usuario, sucursales: elegidas } });

    const sobras = [];
    if (r.yaTenia && r.yaTenia.length) sobras.push(`ya cubría ${r.yaTenia.join(', ')}`);
    if (r.invalidas && r.invalidas.length) sobras.push(`no están en el catálogo: ${r.invalidas.join(', ')}`);
    const cubre = (r.agregadas && r.agregadas.length) ? r.agregadas.join(', ') : lista;

    if (acceso.ya_existia) {
      toast(`${usuario} ahora cubre ${cubre}.`);
    } else {
      mostrarAcceso({
        titulo: 'Acceso de RH creado',
        lead: `${usuario} administra los equipos de ${cubre}.`,
        usuario: acceso.usuario,
        password: acceso.password,
      });
    }
    if (sobras.length) aviso(`${usuario}: ${sobras.join('; ')}.`, 'aviso');
    e.target.reset();
    await cargarUsuariosRh();
  } catch (err) {
    aviso(`El acceso se creó, pero no se pudieron asignar las agencias: ${err.message}. `
      + 'Vuelve a intentarlo con los mismos datos; no se duplica nada.', 'error');
  } finally {
    btn.disabled = false;
  }
});

async function cargarAperturas() {
  const cuerpo = $('#tabla-aperturas tbody');
  if (!cuerpo) return;
  cuerpo.innerHTML = '';
  let data;
  try { data = await api('aperturas'); } catch (err) { aviso(err.message, 'error'); return; }

  for (const a of data.rows) {
    const tr = document.createElement('tr');
    celda(tr, `${MESES[a.mes - 1]} ${a.anio}`);
    celda(tr, a.gerente);
    celda(tr, a.motivo || '');
    celda(tr, `${a.autorizada_by} · ${fecha(a.autorizada_at)}`);

    const tdEstado = document.createElement('td');
    const estado = document.createElement('span');
    estado.className = `estado-punto ${a.activa ? 'estado-si' : 'estado-no'}`;
    estado.textContent = a.activa ? 'Abierta' : `Cerrada por ${a.cerrada_by}`;
    tdEstado.appendChild(estado);
    tr.appendChild(tdEstado);

    const td = document.createElement('td');
    if (a.activa) {
      const acciones = document.createElement('div');
      acciones.className = 'acciones-celda';
      acciones.appendChild(boton('Cerrar la reapertura', 'btn btn-fantasma', async () => {
        try {
          await api(`aperturas/${a.apertura_id}/cerrar`, { method: 'POST', body: {} });
          toast('Reapertura cerrada.');
          await cargarAperturas();
        } catch (err) { aviso(err.message, 'error'); }
      }));
      td.appendChild(acciones);
    }
    tr.appendChild(td);
    cuerpo.appendChild(tr);
  }

  if (!data.rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'vacio';
    const fuerte = document.createElement('strong');
    fuerte.textContent = 'Ningún mes se ha reabierto.';
    td.appendChild(fuerte);
    td.appendChild(document.createTextNode('Aquí queda el rastro de cada reapertura, con su motivo.'));
    tr.appendChild(td);
    cuerpo.appendChild(tr);
  }
}

$('#form-apertura').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('aperturas', {
      method: 'POST',
      body: {
        anio: Number(fd.get('anio')), mes: Number(fd.get('mes')),
        gerente_id: Number(fd.get('gerente_id')), motivo: fd.get('motivo'),
      },
    });
    toast('Mes reabierto.');
    e.target.reset();
    $('#ap-anio').value = ctx.anio_actual;
    await cargarAperturas();
  } catch (err) { aviso(err.message, 'error'); }
});

const RUBROS_DB = [
  { campo: 'facturas', titulo: 'Ventas' },
  { campo: 'prospectos', titulo: 'Prospectos' },
  { campo: 'demos', titulo: 'Demos' },
  { campo: 'solicitudes', titulo: 'Solicitudes' },
  { campo: 'crednissa', titulo: 'Créditos' },
  { campo: 'entregas', titulo: 'Entregas' },
];
const ETAPAS_EMBUDO = ['prospectos', 'demos', 'solicitudes', 'facturas', 'entregas'];
const NOMBRE_ETAPA = {
  prospectos: 'Prospectos', demos: 'Demos', solicitudes: 'Solicitudes',
  facturas: 'Ventas', entregas: 'Entregas', crednissa: 'Créditos',
};

const CONVERSION_ANTES_DE = {
  demos: { texto: 'llega a demo' },
  solicitudes: { texto: 'pide solicitud' },
  facturas: { texto: 'compra' },
};

const SIGUIENTE_NIVEL = { sucursal: 'gerente', gerente: 'asesor' };

let dashboard = null;
let nivelDb = null;
let ordenDb = { campo: 'facturas', desc: true };

$('#db-f-mes').addEventListener('change', cargarDashboard);
$('#db-f-anio').addEventListener('change', cargarDashboard);
$('#db-mes-ant').addEventListener('click', () => moverMesDashboard(-1));
$('#db-mes-sig').addEventListener('click', () => moverMesDashboard(1));
$('#db-f-sucursal').addEventListener('change', () => { pintarFiltrosDashboard(); pintarDashboard(); });
$('#db-f-gerente').addEventListener('change', pintarDashboard);
$('#db-nivel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nivel]');
  if (!b) return;
  nivelDb = b.dataset.nivel;
  pintarDashboard();
});

function moverMesDashboard(paso) {
  let mes = parseInt($('#db-f-mes').value, 10) + paso;
  let anio = parseInt($('#db-f-anio').value, 10);
  if (mes < 1) { mes = 12; anio -= 1; }
  if (mes > 12) { mes = 1; anio += 1; }
  $('#db-f-mes').value = String(mes);
  $('#db-f-anio').value = String(anio);
  cargarDashboard();
}

async function cargarDashboard() {
  const anio = parseInt($('#db-f-anio').value, 10);
  const mes = parseInt($('#db-f-mes').value, 10);
  $('#db-mes').textContent = MESES[mes - 1] || '—';
  $('#db-anio').textContent = String(anio || '');
  $('#db-estado').textContent = 'Cargando…';

  abiertosFact.clear();
  cacheFact.clear();
  try {
    dashboard = await api(`dashboard?anio=${anio}&mes=${mes}`);
  } catch (err) {
    dashboard = null;
    $('#db-estado').textContent = '';
    $('#db-tabla').replaceChildren();
    $('#db-embudo').replaceChildren();
    aviso(`No se pudo leer el dashboard: ${err.message}`, 'error');
    return;
  }
  pintarFiltrosDashboard();
  pintarDashboard();
}

function pintarFiltrosDashboard() {
  const suc = $('#db-f-sucursal').value;
  for (const [sel, campo, todas, filas] of [
    [$('#db-f-sucursal'), 'sucursal', 'Todas las sucursales', dashboard.rows],
    [$('#db-f-gerente'), 'gerente', 'Todos los gerentes', dashboard.rows.filter((r) => !suc || r.sucursal === suc)],
  ]) {
    const antes = sel.value;
    const valores = [...new Set(filas.map((r) => r[campo]))].sort((a, b) => a.localeCompare(b, 'es'));
    llenarSelect(sel, valores.map((v) => [v, v]), valores.length > 1 ? todas : null);
    sel.disabled = valores.length <= 1;
    if (valores.includes(antes)) sel.value = antes;
  }
}

function filasDashboard() {
  const suc = $('#db-f-sucursal').value;
  const ger = $('#db-f-gerente').value;
  return dashboard.rows.filter((r) => (!suc || r.sucursal === suc) && (!ger || r.gerente === ger));
}

function totalesDashboard(filas) {
  const objetivo = {};
  const real = {};
  for (const c of CAMPOS) { objetivo[c] = 0; real[c] = 0; }
  const vistos = new Set();
  for (const f of filas) {
    for (const c of CAMPOS) objetivo[c] += f.objetivo[c];
    if (vistos.has(f.apv_id)) continue;
    vistos.add(f.apv_id);
    for (const c of CAMPOS) real[c] = (real[c] === null || f.real[c] === null) ? null : real[c] + f.real[c];
  }
  return { objetivo, real, asesores: vistos.size };
}

const fmtN = new Intl.NumberFormat('es-MX');
const fmtP = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 0 });
const fmtP1 = new Intl.NumberFormat('es-MX', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

function cumplimiento(t, campo) {
  const r = t.real[campo];
  const o = t.objetivo[campo];
  return r === null || !o ? null : r / o;
}

function tono(v) {
  if (v === null || v === undefined) return '';
  if (v >= 1) return 'ok';
  if (v >= 0.6) return 'medio';
  return 'bajo';
}

function barra(v, clase = 'db-barra') {
  const b = document.createElement('div');
  b.className = clase;
  const lleno = document.createElement('span');
  lleno.style.width = `${v === null ? 0 : Math.min(v, 1) * 100}%`;
  if (tono(v)) lleno.dataset.tono = tono(v);
  b.appendChild(lleno);
  return b;
}

function pintarDashboard() {
  if (!dashboard) return;
  const { avance, anio, mes } = dashboard;
  const filas = filasDashboard();
  const tot = totalesDashboard(filas);

  let cuando = 'Mes terminado';
  if (avance === 0) cuando = 'Aún no empieza';
  else if (avance < 1) {
    const dias = new Date(anio, mes, 0).getDate();
    cuando = `Día ${Math.round(avance * dias)} de ${dias}`;
  }
  $('#db-estado').textContent = dashboard.motivo
    || `${cuando} · ${tot.asesores} asesor${tot.asesores === 1 ? '' : 'es'}`;

  const caidas = [];
  const f = dashboard.fuentes || {};
  if (f.hubspot && !f.hubspot.ok) caidas.push(`CRM (prospectos, demos y solicitudes): ${f.hubspot.error}`);
  if (f.qvn && !f.qvn.ok) caidas.push(`DMS (ventas, créditos y entregas): ${f.qvn.error}`);
  if (f.incadea && !f.incadea.ok) caidas.push(`DMS secundario (ventas y entregas): ${f.incadea.error}`);
  $('#db-fuentes').hidden = !caidas.length;
  $('#db-fuentes').textContent = caidas.length ? `No se pudo leer ${caidas.join(' · ')}` : '';

  pintarHeroe(tot);
  pintarEmbudo(tot);
  pintarTop();
  pintarTablaDb(filas);
}

function pintarHeroe(tot) {
  const v = cumplimiento(tot, 'facturas');
  $('#db-heroe-real').textContent = tot.real.facturas === null ? '—' : fmtN.format(tot.real.facturas);
  $('#db-heroe-obj').textContent = `de ${fmtN.format(tot.objetivo.facturas)}`;
  const pct = $('#db-heroe-pct');
  pct.textContent = v === null ? 'Sin objetivo' : `${fmtP.format(v)} del objetivo`;
  pct.dataset.tono = tono(v);
  const lleno = $('#db-heroe-lleno');
  lleno.style.width = `${v === null ? 0 : Math.min(v, 1) * 100}%`;
  lleno.dataset.tono = tono(v);

  const extra = $('#db-heroe-extra');
  extra.replaceChildren();
  const cierre = tot.real.facturas === null || tot.real.prospectos === null ? null
    : (tot.real.prospectos ? tot.real.facturas / tot.real.prospectos : 0);
  for (const [dt, dd] of [
    ['Entregas', tot.real.entregas === null ? '—' : `${fmtN.format(tot.real.entregas)} de ${fmtN.format(tot.objetivo.entregas)}`],
    ['Créditos', tot.real.crednissa === null ? '—' : `${fmtN.format(tot.real.crednissa)} de ${fmtN.format(tot.objetivo.crednissa)}`],
    ['% cierre', cierre === null ? '—' : fmtP1.format(cierre)],
  ]) {
    const d = document.createElement('div');
    const t = document.createElement('dt');
    t.textContent = dt;
    const v2 = document.createElement('dd');
    v2.textContent = dd;
    d.append(t, v2);
    extra.appendChild(d);
  }
}

function pintarEmbudo(tot) {
  const ol = $('#db-embudo');
  ol.replaceChildren();
  for (const campo of ETAPAS_EMBUDO) {
    const conv = CONVERSION_ANTES_DE[campo];
    if (conv) {
      const li = document.createElement('li');
      li.className = 'db-conv';
      const r = tot.real[campo] === null || tot.real.prospectos === null ? null
        : (tot.real.prospectos ? tot.real[campo] / tot.real.prospectos : 0);
      const meta = tot.objetivo.prospectos ? tot.objetivo[campo] / tot.objetivo.prospectos : null;
      const fuerte = document.createElement('strong');
      fuerte.textContent = r === null ? '—' : fmtP1.format(r);
      if (r !== null && meta) fuerte.dataset.tono = tono(r / meta);
      li.append(fuerte, document.createTextNode(` de los prospectos ${conv.texto}`));
      if (meta) {
        const m = document.createElement('span');
        m.className = 'db-conv-meta';
        m.textContent = `meta ${fmtP.format(meta)}`;
        li.appendChild(m);
      }
      ol.appendChild(li);
    }

    const v = cumplimiento(tot, campo);
    const li = document.createElement('li');
    li.className = 'db-etapa';
    const nom = document.createElement('span');
    nom.className = 'db-etapa-nombre';
    nom.textContent = NOMBRE_ETAPA[campo];
    const cifras = document.createElement('span');
    cifras.className = 'db-etapa-cifras';
    const real = document.createElement('strong');
    real.textContent = tot.real[campo] === null ? '—' : fmtN.format(tot.real[campo]);
    cifras.append(real, document.createTextNode(` de ${fmtN.format(tot.objetivo[campo])}`));
    const pct = document.createElement('span');
    pct.className = 'db-etapa-pct';
    pct.textContent = v === null ? '—' : fmtP.format(v);
    pct.dataset.tono = tono(v);
    li.append(nom, barra(v), cifras, pct);
    ol.appendChild(li);
  }
}

function gruposDb(filas, nivel) {

  const sucFija = Boolean($('#db-f-sucursal').value) || new Set(filas.map((r) => r.sucursal)).size === 1;
  const gerFijo = Boolean($('#db-f-gerente').value) || new Set(filas.map((r) => r.gerente)).size === 1;
  const grupos = new Map();
  for (const r of filas) {
    const clave = nivel === 'asesor' ? `${r.apv_id}|${r.sucursal}` : r[nivel];
    if (!grupos.has(clave)) grupos.set(clave, { clave, filas: [], fila: r });
    grupos.get(clave).filas.push(r);
  }
  return [...grupos.values()].map((g) => {
    const t = totalesDashboard(g.filas);
    let nombre;
    let sub;
    if (nivel === 'asesor') {
      nombre = g.fila.asesor;
      sub = [sucFija ? null : g.fila.sucursal, gerFijo ? null : g.fila.gerente].filter(Boolean).join(' · ');
    } else if (nivel === 'gerente') {
      nombre = g.clave;
      const sucs = [...new Set(g.filas.map((x) => x.sucursal))];
      sub = [sucFija ? null : sucs.join(', '), `${t.asesores} asesor${t.asesores === 1 ? '' : 'es'}`].filter(Boolean).join(' · ');
    } else {
      nombre = g.clave;
      const gers = new Set(g.filas.map((x) => x.gerente)).size;
      sub = `${gers} gerente${gers === 1 ? '' : 's'} · ${t.asesores} asesor${t.asesores === 1 ? '' : 'es'}`;
    }
    return { ...g, t, nombre, sub };
  });
}

function nivelPorOmision(filas) {
  if (new Set(filas.map((r) => r.sucursal)).size > 1) return 'sucursal';
  if (new Set(filas.map((r) => r.gerente)).size > 1) return 'gerente';
  return 'asesor';
}

function pintarTablaDb(filas) {
  const nivel = nivelDb || nivelPorOmision(filas);
  $$('#db-nivel [data-nivel]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.nivel === nivel)));

  const grupos = gruposDb(filas, nivel);
  const { campo, desc } = ordenDb;
  grupos.sort((a, b) => {
    if (campo === 'nombre') return (desc ? -1 : 1) * a.nombre.localeCompare(b.nombre, 'es');
    const va = cumplimiento(a.t, campo);
    const vb = cumplimiento(b.t, campo);

    if (va === null && vb === null) return a.nombre.localeCompare(b.nombre, 'es');
    if (va === null) return 1;
    if (vb === null) return -1;
    return desc ? vb - va : va - vb;
  });

  const tabla = $('#db-tabla');
  tabla.replaceChildren();

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  const cols = [{ campo: 'nombre', titulo: { sucursal: 'Sucursal', gerente: 'Gerente', asesor: 'Asesor' }[nivel] }, ...RUBROS_DB];
  for (const col of cols) {
    const th = document.createElement('th');
    th.scope = 'col';
    if (col.campo !== 'nombre') th.className = 'db-col-num';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'db-orden';
    b.dataset.campo = col.campo;
    b.textContent = col.titulo;
    if (ordenDb.campo === col.campo) {
      th.setAttribute('aria-sort', ordenDb.desc ? 'descending' : 'ascending');
      const flecha = document.createElement('span');
      flecha.setAttribute('aria-hidden', 'true');
      flecha.textContent = ordenDb.desc ? ' ↓' : ' ↑';
      b.appendChild(flecha);
    }
    th.appendChild(b);
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tabla.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!grupos.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = cols.length;
    td.className = 'vacio';
    td.textContent = dashboard.motivo || 'No hay asesores con objetivo ni asignación en este mes.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const siguiente = SIGUIENTE_NIVEL[nivel];
  for (const g of grupos) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'db-nombre';

    const esAsesor = nivel === 'asesor';
    const claveFact = esAsesor ? `${g.fila.apv_id}|${g.fila.sucursal}` : null;

    const nom =  (document.createElement(siguiente || esAsesor ? 'button' : 'span'));
    nom.className = 'db-nombre-principal';
    nom.textContent = g.nombre;
    if (esAsesor) {
      const abierto = abiertosFact.has(claveFact);
      nom.type = 'button';
      nom.dataset.facturas = claveFact;
      nom.setAttribute('aria-expanded', String(abierto));
      nom.title = abierto ? 'Ocultar sus autos facturados' : 'Ver sus autos facturados';
      const flecha = document.createElement('span');
      flecha.className = 'db-flecha db-flecha-abajo';
      flecha.setAttribute('aria-hidden', 'true');
      flecha.textContent = '›';
      nom.appendChild(flecha);
    } else if (siguiente) {
      nom.type = 'button';
      nom.dataset.baja = nivel;
      nom.dataset.valor = g.clave;
      nom.title = `Ver ${siguiente === 'gerente' ? 'los gerentes' : 'los asesores'} de ${g.nombre}`;
      const flecha = document.createElement('span');
      flecha.className = 'db-flecha';
      flecha.setAttribute('aria-hidden', 'true');
      flecha.textContent = '›';
      nom.appendChild(flecha);
    }
    th.appendChild(nom);

    if (g.sub) {
      const sub = document.createElement('span');
      sub.className = 'db-nombre-sub';
      sub.textContent = g.sub;
      th.appendChild(sub);
    }

    if (nivel === 'asesor') {
      const r = g.fila;
      const marcas = [];
      if (!r.con_objetivo) marcas.push(['Sin objetivo', '']);
      if (r.multi_agencia) marcas.push(['Multi-agencia: lo real suma todas sus agencias', '']);
      if (r.sin_empate) marcas.push(['No aparece en el CRM ni en el DMS', 'error']);
      if (marcas.length) {
        const caja = document.createElement('span');
        caja.className = 'db-marcas';
        for (const [texto, tipo] of marcas) {
          const m = document.createElement('span');
          m.className = 'db-marca';
          if (tipo) m.dataset.tipo = tipo;
          m.textContent = texto;
          caja.appendChild(m);
        }
        th.appendChild(caja);
      }
    }
    tr.appendChild(th);

    for (const col of RUBROS_DB) tr.appendChild(celdaDb(g.t, col));
    tbody.appendChild(tr);
    if (esAsesor && abiertosFact.has(claveFact)) {
      tr.classList.add('db-abierto');
      tbody.appendChild(renglonFacturas(g.fila, cols.length));
    }
  }
  tabla.appendChild(tbody);

  if (grupos.length > 1) {
    const tfoot = document.createElement('tfoot');
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'db-nombre';
    th.textContent = 'Total';
    tr.appendChild(th);
    const tot = totalesDashboard(filas);
    for (const col of RUBROS_DB) tr.appendChild(celdaDb(tot, col));
    tfoot.appendChild(tr);
    tabla.appendChild(tfoot);
  }
}

function celdaDb(t, col) {
  const td = document.createElement('td');
  td.className = 'db-celda';
  td.dataset.etiqueta = col.titulo;
  const v = cumplimiento(t, col.campo);
  const pct = document.createElement('span');
  pct.className = 'db-pct';
  pct.textContent = v === null ? '—' : fmtP.format(v);
  if (tono(v)) pct.dataset.tono = tono(v);
  const cifras = document.createElement('span');
  cifras.className = 'db-cifras';
  const r = t.real[col.campo];
  const o = t.objetivo[col.campo];
  cifras.textContent = o ? `${r === null ? '—' : fmtN.format(r)} de ${fmtN.format(o)}`
    : (r === null ? 'sin dato' : `${fmtN.format(r)} · sin objetivo`);
  td.append(pct, cifras, barra(v, 'db-barra db-barra-chica'));
  return td;
}

$('#db-tabla').addEventListener('click', (e) => {
  const orden = e.target.closest('.db-orden');
  if (orden) {
    const campo = orden.dataset.campo;
    ordenDb = ordenDb.campo === campo
      ? { campo, desc: !ordenDb.desc }
      : { campo, desc: campo !== 'nombre' };
    pintarDashboard();
    return;
  }
  const fact = e.target.closest('[data-facturas]');
  if (fact) {
    const clave = fact.dataset.facturas;
    if (abiertosFact.has(clave)) {
      abiertosFact.delete(clave);

      const apvId = Number(clave.split('|')[0]);
      if (cacheFact.get(apvId)?.ok === false) cacheFact.delete(apvId);
    } else {
      abiertosFact.add(clave);
    }

    pintarTablaDb(filasDashboard());

    $(`#db-tabla [data-facturas="${CSS.escape(clave)}"]`)?.focus();
    return;
  }
  const baja = e.target.closest('[data-baja]');
  if (baja) bajarNivel(baja.dataset.baja, baja.dataset.valor);
});
$('#db-top').addEventListener('click', (e) => {
  const baja = e.target.closest('[data-baja]');
  if (baja) bajarNivel(baja.dataset.baja, baja.dataset.valor);
});

const abiertosFact = new Set();
const cacheFact = new Map();

const fmtDia = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtPesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

function celdaPesos(valor, rojoSiNegativo = true) {
  const td = document.createElement('td');
  td.className = 'db-utilidad';
  if (valor === null || valor === undefined) {
    td.textContent = '—';
    return td;
  }
  td.textContent = fmtPesos.format(valor);
  if (rojoSiNegativo && Math.round(valor) < 0) td.classList.add('db-utilidad-neg');
  return td;
}

function renglonFacturas(fila, columnas) {
  const tr = document.createElement('tr');
  tr.className = 'db-detalle';
  const td = document.createElement('td');
  td.colSpan = columnas;
  const caja = document.createElement('div');
  caja.className = 'db-autos';
  td.appendChild(caja);
  tr.appendChild(td);

  const listo = cacheFact.get(fila.apv_id);
  if (listo && !(listo instanceof Promise)) {
    pintarFacturas(caja, listo);
    return tr;
  }

  caja.textContent = 'Cargando sus autos…';
  if (!listo) {
    const { anio, mes } = dashboard;
    const pedido = api(`dashboard/facturas?anio=${anio}&mes=${mes}&apv_id=${fila.apv_id}`)
      .catch((err) => ({ ok: false, error: err.message, rows: [] }));
    cacheFact.set(fila.apv_id, pedido);
    pedido.then((data) => {
      cacheFact.set(fila.apv_id, data);

      if (dashboard && dashboard.anio === anio && dashboard.mes === mes) pintarTablaDb(filasDashboard());
    });
  }
  return tr;
}

function pintarFacturas(caja, data) {
  caja.replaceChildren();
  if (!data.ok) {
    const p = document.createElement('p');
    p.className = 'db-autos-nota db-autos-error';
    p.textContent = `No se pudieron leer sus autos: ${data.error}`;
    caja.appendChild(p);
    return;
  }
  const n = data.rows.length;
  const titulo = document.createElement('p');
  titulo.className = 'db-autos-titulo';
  titulo.textContent = n
    ? `${n} auto${n === 1 ? '' : 's'} facturado${n === 1 ? '' : 's'} en ${MESES[dashboard.mes - 1].toLowerCase()}`
    : `Sin autos facturados en ${MESES[dashboard.mes - 1].toLowerCase()}.`;
  caja.appendChild(titulo);
  if (!n) return;

  const variasAgencias = new Set(data.rows.map((r) => r.sucursal)).size > 1;
  const tabla = document.createElement('table');
  tabla.className = 'db-autos-tabla';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');

  const titulos = ['VIN', 'Año', 'Modelo', 'Fecha de venta', 'Precio de venta', 'Utilidad bruta', 'Utilidad total',
    ...(variasAgencias ? ['Agencia'] : [])];
  for (const t of titulos) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = t;
    if (t.startsWith('Utilidad') || t === 'Precio de venta') th.className = 'db-utilidad';
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tabla.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const r of data.rows) {
    const tr = document.createElement('tr');
    const vin = document.createElement('td');
    vin.className = 'db-vin';
    vin.textContent = r.vin || '—';
    const anio = document.createElement('td');
    anio.textContent = r.anio || '—';
    const modelo = document.createElement('td');
    const fuerte = document.createElement('strong');
    fuerte.textContent = r.modelo || '—';
    modelo.appendChild(fuerte);
    const version = (r.unidad || '').slice((r.modelo || '').length).trim();
    if (version) {
      const v = document.createElement('span');
      v.className = 'db-version';
      v.textContent = version;
      modelo.appendChild(v);
    }
    const factura = document.createElement('td');
    factura.textContent = r.factura ? fmtDia.format(new Date(r.factura)) : '—';
    tr.append(vin, anio, modelo, factura, celdaPesos(r.precio_venta, false),
      celdaPesos(r.utilidad_bruta), celdaPesos(r.utilidad_total));
    if (variasAgencias) {
      const suc = document.createElement('td');
      suc.textContent = r.sucursal || '—';
      tr.appendChild(suc);
    }
    tbody.appendChild(tr);
  }
  tabla.appendChild(tbody);

  const scroll = document.createElement('div');
  scroll.className = 'db-autos-scroll';
  scroll.appendChild(tabla);
  caja.appendChild(scroll);
}

function bajarNivel(desde, valor) {
  const sel = desde === 'sucursal' ? $('#db-f-sucursal') : $('#db-f-gerente');
  if ([...sel.options].some((o) => o.value === valor)) sel.value = valor;
  nivelDb = SIGUIENTE_NIVEL[desde];
  pintarFiltrosDashboard();
  pintarDashboard();
  $('#db-tabla').closest('.db-tabla-caja').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const UMBRAL_TOP = 0.95;

function veTopAgencias() {
  if (ctx.rol === 'admin') return true;
  return (ctx.mis_sucursales || []).length >= 3;
}

function rankingAgencias() {
  const ger = $('#db-f-gerente').value;
  const filas = dashboard.rows.filter((r) => !ger || r.gerente === ger);
  return gruposDb(filas, 'sucursal')
    .map((g) => {
      const indicadores = RUBROS_DB.map((col) => ({ ...col, v: cumplimiento(g.t, col.campo) }));
      const medibles = indicadores.filter((i) => i.v !== null);
      return {
        nombre: g.nombre,
        indicadores,
        medibles: medibles.length,
        arriba: medibles.filter((i) => i.v >= UMBRAL_TOP).length,
        ventas: cumplimiento(g.t, 'facturas'),
      };
    })
    .filter((a) => a.medibles > 0)
    .sort((a, b) => (b.arriba - a.arriba)
      || ((b.ventas ?? -1) - (a.ventas ?? -1))
      || a.nombre.localeCompare(b.nombre, 'es'));
}

function pintarTop() {
  const caja = $('#db-top');
  const lista = $('#db-top-lista');
  const ranking = veTopAgencias() && !$('#db-f-sucursal').value ? rankingAgencias() : [];
  caja.hidden = ranking.length < 3;
  lista.replaceChildren();
  if (caja.hidden) return;

  ranking.slice(0, 3).forEach((a, i) => {
    const li = document.createElement('li');
    li.className = 'db-top-item';

    const lugar = document.createElement('span');
    lugar.className = 'db-top-lugar';
    lugar.textContent = String(i + 1);
    lugar.setAttribute('aria-label', `Lugar ${i + 1}`);

    const nom = document.createElement('button');
    nom.type = 'button';
    nom.className = 'db-top-nombre';
    nom.dataset.baja = 'sucursal';
    nom.dataset.valor = a.nombre;
    nom.title = `Ver los gerentes de ${a.nombre}`;
    nom.textContent = a.nombre;
    const flecha = document.createElement('span');
    flecha.className = 'db-flecha';
    flecha.setAttribute('aria-hidden', 'true');
    flecha.textContent = '›';
    nom.appendChild(flecha);

    const marcador = document.createElement('p');
    marcador.className = 'db-top-marcador';
    const fuerte = document.createElement('strong');
    fuerte.textContent = `${a.arriba} de ${a.medibles}`;
    marcador.append(fuerte, document.createTextNode(' indicadores en 95 % o más'));

    const ul = document.createElement('ul');
    ul.className = 'db-top-indicadores';
    for (const ind of a.indicadores) {
      const it = document.createElement('li');
      if (ind.v !== null && ind.v >= UMBRAL_TOP) it.dataset.logrado = 'true';
      const n = document.createElement('span');
      n.textContent = ind.titulo;
      const v = document.createElement('strong');
      v.textContent = ind.v === null ? '—' : fmtP.format(ind.v);
      if (tono(ind.v)) v.dataset.tono = tono(ind.v);
      it.append(n, v);
      ul.appendChild(it);
    }

    li.append(lugar, nom, marcador, ul);
    lista.appendChild(li);
  });
}

let forecast = null;
let nivelFc = null;
let ordenFc = { campo: 'estimado', desc: true };

let diaFc = 15;

const CIERRE = 99;
const DIAS_FC = [5, 10, 15, 20, 25, CIERRE];

function esCerrado() {
  return Boolean(forecast && forecast.avance && forecast.avance.fraccion === 1
    && forecast.rows.some((r) => r.estimado_por_dia));
}

function diaComparado() {
  return Math.min(Math.max(diaFc, 1), forecast.avance.dias - 1);
}

function alDia() {
  return diaFc === CIERRE ? 'al cierre' : `al día ${diaComparado()}`;
}

function columnasFc() {
  if (esCerrado()) {
    return [
      { campo: 'objetivo', titulo: 'Objetivo' },
      { campo: 'real', titulo: 'Cierre real' },
      { campo: 'estimadoDia', titulo: `Estimado ${alDia()}` },
      { campo: 'error', titulo: 'Diferencia' },
    ];
  }
  return [
    { campo: 'objetivo', titulo: 'Objetivo' },
    { campo: 'real', titulo: 'Llevan' },
    { campo: 'estimado', titulo: 'Cierre estimado' },
    { campo: 'diferencia', titulo: 'Contra objetivo' },
  ];
}

$('#fc-f-mes').addEventListener('change', cargarForecast);
$('#fc-f-anio').addEventListener('change', cargarForecast);
$('#fc-mes-ant').addEventListener('click', () => moverMesForecast(-1));
$('#fc-mes-sig').addEventListener('click', () => moverMesForecast(1));
$('#fc-f-sucursal').addEventListener('change', () => { pintarFiltrosForecast(); pintarForecast(); });
$('#fc-f-gerente').addEventListener('change', pintarForecast);
$('#fc-nivel').addEventListener('click', (e) => {
  const b = e.target.closest('[data-nivel]');
  if (!b) return;
  nivelFc = b.dataset.nivel;
  pintarForecast();
});

function moverMesForecast(paso) {
  let mes = parseInt($('#fc-f-mes').value, 10) + paso;
  let anio = parseInt($('#fc-f-anio').value, 10);
  if (mes < 1) { mes = 12; anio -= 1; }
  if (mes > 12) { mes = 1; anio += 1; }
  $('#fc-f-mes').value = String(mes);
  $('#fc-f-anio').value = String(anio);
  cargarForecast();
}

async function cargarForecast() {
  const anio = parseInt($('#fc-f-anio').value, 10);
  const mes = parseInt($('#fc-f-mes').value, 10);
  $('#fc-mes').textContent = MESES[mes - 1] || '—';
  $('#fc-anio').textContent = String(anio || '');
  $('#fc-estado').textContent = 'Cargando…';
  try {
    forecast = await api(`forecast?anio=${anio}&mes=${mes}`);
  } catch (err) {
    forecast = null;
    $('#fc-estado').textContent = '';
    $('#fc-tabla').replaceChildren();
    aviso(`No se pudo leer el forecast: ${err.message}`, 'error');
    return;
  }
  pintarFiltrosForecast();
  pintarForecast();
}

function pintarFiltrosForecast() {
  const suc = $('#fc-f-sucursal').value;
  for (const [sel, campo, todas, filas] of [
    [$('#fc-f-sucursal'), 'sucursal', 'Todas las sucursales', forecast.rows],
    [$('#fc-f-gerente'), 'gerente', 'Todos los gerentes', forecast.rows.filter((r) => !suc || r.sucursal === suc)],
  ]) {
    const antes = sel.value;
    const valores = [...new Set(filas.map((r) => r[campo]))].sort((a, b) => a.localeCompare(b, 'es'));
    llenarSelect(sel, valores.map((v) => [v, v]), valores.length > 1 ? todas : null);
    sel.disabled = valores.length <= 1;
    if (valores.includes(antes)) sel.value = antes;
  }
}

function filasForecast() {
  const suc = $('#fc-f-sucursal').value;
  const ger = $('#fc-f-gerente').value;
  return forecast.rows.filter((r) => (!suc || r.sucursal === suc) && (!ger || r.gerente === ger));
}

function totalesForecast(filas) {
  const t = { objetivo: 0, real: 0, estimado: 0, asesores: 0, conObjetivo: 0 };
  const medibles = { real: 0, estimado: 0 };
  const porAsesor = new Map();
  for (const f of filas) {
    t.objetivo += f.objetivo;
    const a = porAsesor.get(f.apv_id) || { fila: f, conObjetivo: false };
    a.conObjetivo = a.conObjetivo || f.con_objetivo;
    porAsesor.set(f.apv_id, a);
  }
  const suma = (acc, c, v) => (acc[c] === null || v === null ? null : acc[c] + v);
  for (const { fila, conObjetivo } of porAsesor.values()) {
    for (const c of ['real', 'estimado']) {
      t[c] = suma(t, c, fila[c]);
      if (conObjetivo) medibles[c] = suma(medibles, c, fila[c]);
    }
    if (conObjetivo) t.conObjetivo++;
  }
  t.asesores = porAsesor.size;

  if (t.estimado !== null) t.estimado = Math.round(t.estimado);
  if (medibles.estimado !== null) medibles.estimado = Math.round(medibles.estimado);
  t.medibles = medibles;
  t.pct = medibles.estimado === null || !t.objetivo ? null : medibles.estimado / t.objetivo;
  t.diferencia = medibles.estimado === null || !t.objetivo ? null : medibles.estimado - t.objetivo;

  if (esCerrado()) {
    const d = diaComparado();
    let est = 0;
    let lleva = 0;
    for (const { fila } of porAsesor.values()) {
      est = est === null || !fila.estimado_por_dia ? null : est + fila.estimado_por_dia[d];
      lleva = lleva === null || !fila.acumulado ? null : lleva + fila.acumulado[d];
    }
    t.estimadoDia = est === null ? null : Math.round(est);
    t.realDia = lleva;
    t.error = t.estimadoDia === null || t.real === null ? null : t.estimadoDia - t.real;
    t.pctReal = medibles.real === null || !t.objetivo ? null : medibles.real / t.objetivo;
  }
  return t;
}

function tonoPrecision(error, real) {
  if (error === null || real === null) return '';
  const e = Math.abs(error);
  if (e <= Math.max(1, real * 0.1)) return 'ok';
  if (e <= Math.max(2, real * 0.25)) return 'medio';
  return 'bajo';
}

function mesesCortos(r) {
  const corto = (iso) => MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3).toLowerCase();
  return `${corto(r.desde)}–${corto(r.hasta)}`;
}

function barraForecast(tot, clase) {
  const caja = document.createElement('div');
  caja.className = clase;

  const t = tot.objetivo ? { ...tot, ...tot.medibles } : tot;
  const escala = Math.max(t.objetivo, t.estimado || 0, t.real || 0, 1);
  const tn = tono(t.pct);
  if (tn) caja.dataset.tono = tn;
  if (t.real !== null) {
    const lleva = document.createElement('span');
    lleva.className = 'fc-lleva';
    lleva.style.width = `${(t.real / escala) * 100}%`;
    caja.appendChild(lleva);
  }
  if (t.estimado !== null && t.real !== null && t.estimado > t.real) {
    const resto = document.createElement('span');
    resto.className = 'fc-resto';
    resto.style.left = `${(t.real / escala) * 100}%`;
    resto.style.width = `${((t.estimado - t.real) / escala) * 100}%`;
    caja.appendChild(resto);
  }
  if (t.objetivo) {
    const meta = document.createElement('i');
    meta.className = 'fc-meta';
    meta.style.left = `${(t.objetivo / escala) * 100}%`;
    caja.appendChild(meta);
  }
  return caja;
}

const firmado = (n) => (n > 0 ? `+${fmtN.format(n)}` : n < 0 ? `−${fmtN.format(-n)}` : '0');

function pintarForecast() {
  if (!forecast) return;
  const filas = filasForecast();
  const tot = totalesForecast(filas);
  const { avance, corte } = forecast;
  const mesNombre = MESES[forecast.mes - 1].toLowerCase();

  let cuando = '';
  if (avance) {
    if (avance.fraccion === 1) cuando = 'Mes cerrado en el DMS';
    else if (avance.dia === 0) cuando = `Sin facturas de ${mesNombre} todavía`;
    else cuando = `Día ${avance.dia} de ${avance.dias}`;
    if (corte && avance.fraccion < 1) cuando += ` · DMS al ${fmtDia.format(new Date(corte))}`;
  }
  $('#fc-estado').textContent = forecast.motivo
    || [cuando, `${tot.asesores} asesor${tot.asesores === 1 ? '' : 'es'}`].filter(Boolean).join(' · ');

  const f = forecast.fuente || {};
  const avisos = [];
  if (f.ok === false) avisos.push(`No se pudo estimar: DMS — ${f.error}`);
  if (forecast.retro && forecast.retro.ok === false) {
    avisos.push(`No se pudo reconstruir lo estimado cada día: ${forecast.retro.error}`);
  }
  $('#fc-fuente').hidden = !avisos.length;
  $('#fc-fuente').textContent = avisos.join(' · ');

  if (esCerrado()) {
    pintarHeroeCierre(tot);
    pintarQueTanBien(filas, tot);
  } else {
    pintarHeroeForecast(tot);
    pintarComoSeEstima();
  }
  pintarTablaFc(filas);
}

function pintarExtra(pares) {
  const extra = $('#fc-heroe-extra');
  extra.replaceChildren();
  for (const [dt, dd] of pares) {
    const d = document.createElement('div');
    const t = document.createElement('dt');
    t.textContent = dt;
    const v = document.createElement('dd');
    v.textContent = dd;
    d.append(t, v);
    extra.appendChild(d);
  }
}

function pintarHeroeCierre(tot) {
  $('#fc-heroe-t').textContent = 'Cierre real de ventas';
  $('#fc-heroe-est').textContent = tot.real === null ? '—' : fmtN.format(tot.real);
  $('#fc-heroe-obj').textContent = tot.objetivo ? `de ${fmtN.format(tot.objetivo)}` : 'sin objetivo';
  const pct = $('#fc-heroe-pct');
  pct.textContent = tot.pctReal === null ? '' : `${fmtP.format(tot.pctReal)} del objetivo`;
  pct.dataset.tono = tono(tot.pctReal);
  const parcial = $('#fc-heroe-parcial');
  parcial.hidden = !(tot.objetivo && tot.conObjetivo < tot.asesores);
  parcial.textContent = parcial.hidden ? ''
    : `El % compara a los ${fmtN.format(tot.conObjetivo)} de ${fmtN.format(tot.asesores)} asesores con objetivo `
      + `(${fmtN.format(tot.medibles.real ?? 0)} vendidas).`;
  const barra = barraForecast(comoReal(tot), 'fc-barra fc-barra-grande');
  barra.id = 'fc-heroe-barra';
  $('#fc-heroe-barra').replaceWith(barra);

  const relativo = tot.error === null || !tot.real ? ''
    : ` (${tot.error > 0 ? '+' : tot.error < 0 ? '−' : ''}${fmtP.format(Math.abs(tot.error) / tot.real)})`;
  pintarExtra([
    [`Llevaban ${alDia()}`, tot.realDia === null ? '—' : fmtN.format(tot.realDia)],
    [`Estimado ${alDia()}`, tot.estimadoDia === null ? '—' : fmtN.format(tot.estimadoDia)],
    ['Diferencia', tot.error === null ? '—' : `${firmado(tot.error)}${relativo}`],
  ]);
}

function comoReal(t) {
  return { ...t, estimado: t.real, pct: t.pctReal, medibles: { real: t.medibles.real, estimado: t.medibles.real } };
}

function pintarHeroeForecast(tot) {
  $('#fc-heroe-t').textContent = 'Cierre estimado de ventas';
  $('#fc-heroe-est').textContent = tot.estimado === null ? '—' : fmtN.format(tot.estimado);
  $('#fc-heroe-obj').textContent = tot.objetivo ? `de ${fmtN.format(tot.objetivo)}` : 'sin objetivo';
  const pct = $('#fc-heroe-pct');
  pct.textContent = tot.pct === null ? '' : `${fmtP.format(tot.pct)} del objetivo`;
  pct.dataset.tono = tono(tot.pct);
  const parcial = $('#fc-heroe-parcial');
  parcial.hidden = !(tot.objetivo && tot.conObjetivo < tot.asesores);
  parcial.textContent = parcial.hidden ? ''
    : `El % compara a los ${fmtN.format(tot.conObjetivo)} de ${fmtN.format(tot.asesores)} asesores con objetivo `
      + `(${fmtN.format(tot.medibles.estimado ?? 0)} estimadas).`;
  const barra = barraForecast(tot, 'fc-barra fc-barra-grande');
  barra.id = 'fc-heroe-barra';
  $('#fc-heroe-barra').replaceWith(barra);

  const porVenir = tot.estimado === null || tot.real === null ? null : Math.max(tot.estimado - tot.real, 0);
  const faltan = tot.real === null || !tot.objetivo ? null : Math.max(tot.objetivo - tot.real, 0);
  pintarExtra([
    ['Llevan', tot.real === null ? '—' : fmtN.format(tot.real)],
    ['Por venir', porVenir === null ? '—' : `≈ ${fmtN.format(porVenir)}`],
    ['Faltan para el objetivo', faltan === null ? '—' : fmtN.format(faltan)],
  ]);
}

function pintarComoSeEstima() {
  const { avance, curva, historia } = forecast;
  const texto = $('#fc-como-texto');
  const caja = $('#fc-curva');
  $('#fc-como-t').textContent = 'Cómo se estima';
  $('#fc-dias').hidden = true;
  caja.replaceChildren();
  if (!avance || !curva) { texto.textContent = ''; return; }

  const mesNombre = MESES[forecast.mes - 1].toLowerCase();
  const prom = `su promedio mensual de ${mesesCortos(historia)}`;
  if (avance.fraccion === 1) {
    texto.textContent = `${MESES[forecast.mes - 1]} ya cerró en el DMS: el estimado es lo que se facturó.`;
  } else if (avance.dia === 0) {
    texto.textContent = `El DMS todavía no trae facturas de ${mesNombre}. Por ahora, el estimado de cada asesor es ${prom}.`;
  } else {
    const va = curva[avance.dia];
    texto.textContent = `Al día ${avance.dia}, en un mes normal ya va facturado el ${fmtP.format(va)}, `
      + `no el ${fmtP.format(avance.dia / avance.dias)} que diría el calendario: la venta se carga al cierre. `
      + `A lo que lleva cada asesor se le suma ${prom} por el ${fmtP.format(1 - va)} que falta.`;
  }
  if (forecast.meses_curva === 0) texto.textContent += ' No hay historia para la curva: se usa el calendario.';

  const NS = 'http://www.w3.org/2000/svg';
  const W = 340; const H = 140; const L = 34; const R = 10; const T = 10; const B = 22;
  const dias = avance.dias;
  const x = (d) => L + (d / dias) * (W - L - R);
  const y = (v) => T + (1 - v) * (H - T - B);
  const el = (tag, attrs, txt) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (txt !== undefined) n.textContent = txt;
    return n;
  };
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': 'Parte del mes que va facturada a cada día, en un mes normal, contra la línea del calendario',
  });
  for (const v of [0, 0.5, 1]) {
    svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'fc-curva-rejilla' }));
    svg.appendChild(el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'fc-curva-eje' }, fmtP.format(v)));
  }
  for (const d of [1, 15, dias]) {
    svg.appendChild(el('text', { x: x(d), y: H - 6, 'text-anchor': 'middle', class: 'fc-curva-eje' }, String(d)));
  }
  svg.appendChild(el('line', { x1: x(0), y1: y(0), x2: x(dias), y2: y(1), class: 'fc-curva-calendario' }));
  const puntos = [];
  for (let d = 0; d <= dias && d < curva.length; d++) puntos.push(`${x(d).toFixed(1)},${y(Math.min(curva[d], 1)).toFixed(1)}`);
  svg.appendChild(el('polyline', { points: puntos.join(' '), class: 'fc-curva-linea' }));
  if (avance.dia > 0 && avance.fraccion < 1) {
    const va = curva[avance.dia];
    svg.appendChild(el('line', { x1: x(avance.dia), x2: x(avance.dia), y1: y(0), y2: y(1), class: 'fc-curva-hoy' }));
    svg.appendChild(el('circle', { cx: x(avance.dia), cy: y(va), r: 4.5, class: 'fc-curva-punto' }));
    const izquierda = avance.dia > dias * 0.6;
    svg.appendChild(el('text', {
      x: x(avance.dia) + (izquierda ? -8 : 8),
      y: y(va) - 8,
      'text-anchor': izquierda ? 'end' : 'start',
      class: 'fc-curva-valor',
    }, `día ${avance.dia}: ${fmtP.format(va)}`));
  }
  caja.appendChild(svg);

  const clave = document.createElement('p');
  clave.className = 'fc-curva-clave';
  clave.setAttribute('aria-hidden', 'true');
  for (const [cls, txt] of [['fc-curva-clave-mes', 'Mes normal (últimos 12)'], ['fc-curva-clave-cal', 'Calendario']]) {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = txt;
    clave.appendChild(s);
  }
  caja.appendChild(clave);
}

function pintarQueTanBien(filas, tot) {
  const { avance } = forecast;
  const dias = avance.dias;
  const d = diaComparado();
  $('#fc-como-t').textContent = 'Qué tan bien estimó';

  const selector = $('#fc-dias');
  selector.hidden = false;
  selector.replaceChildren();
  for (const n of DIAS_FC.filter((x) => x === CIERRE || x < dias - 1)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.dia = String(n);
    b.setAttribute('aria-checked', String(n === diaFc || (n !== CIERRE && diaFc !== CIERRE && n === d)));
    b.textContent = n === CIERRE ? 'Cierre' : `Día ${n}`;
    if (n === CIERRE) b.title = `El último día del mes, con el DMS al día ${dias - 1}`;
    selector.appendChild(b);
  }

  const texto = $('#fc-como-texto');
  if (tot.estimadoDia === null || tot.real === null) {
    texto.textContent = '';
  } else {
    const rel = tot.real ? ` (${fmtP.format(Math.abs(tot.error) / tot.real)} ${tot.error < 0 ? 'abajo' : 'arriba'})` : '';
    const cuando = diaFc === CIERRE ? `El último día del mes, con el DMS al ${d},` : `Al día ${d},`;
    texto.textContent = `${cuando} llevaban ${fmtN.format(tot.realDia)} y el Forecast estimaba `
      + `${fmtN.format(tot.estimadoDia)}. El mes cerró en ${fmtN.format(tot.real)}: `
      + `${tot.error === 0 ? 'exacto' : `${firmado(tot.error)}${rel}`}.`;
  }

  const unicos = new Map();
  for (const r of filas) if (!unicos.has(r.apv_id)) unicos.set(r.apv_id, r);
  const est = new Array(dias + 1).fill(0);
  const lleva = new Array(dias + 1).fill(0);
  for (const r of unicos.values()) {
    if (!r.estimado_por_dia || !r.acumulado) continue;
    for (let i = 1; i <= dias; i++) {
      est[i] += r.estimado_por_dia[i];
      lleva[i] += r.acumulado[i];
    }
  }
  const real = tot.real || 0;

  const caja = $('#fc-curva');
  caja.replaceChildren();
  const NS = 'http://www.w3.org/2000/svg';
  const W = 340; const H = 150; const L = 40; const R = 10; const T = 12; const B = 22;
  const tope = Math.max(real, ...est.slice(1), 1) * 1.1;
  const x = (i) => L + ((i - 1) / (dias - 1)) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, tope) / tope) * (H - T - B);
  const el = (tag, attrs, txt) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (txt !== undefined) n.textContent = txt;
    return n;
  };
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': 'Lo que el Forecast estimaba cada día del mes contra lo que de verdad llevaban',
  });
  for (const v of [0, Math.round(tope / 2), Math.round(tope)]) {
    svg.appendChild(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'fc-curva-rejilla' }));
    svg.appendChild(el('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'fc-curva-eje' }, fmtN.format(v)));
  }
  for (const i of [1, 15, dias]) {
    svg.appendChild(el('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'fc-curva-eje' }, String(i)));
  }
  const linea = (serie, clase) => {
    const pts = [];
    for (let i = 1; i <= dias; i++) pts.push(`${x(i).toFixed(1)},${y(serie[i]).toFixed(1)}`);
    svg.appendChild(el('polyline', { points: pts.join(' '), class: clase }));
  };
  linea(lleva, 'fc-curva-real');
  linea(est, 'fc-curva-linea');
  svg.appendChild(el('line', { x1: x(d), x2: x(d), y1: y(0), y2: y(tope), class: 'fc-curva-hoy' }));
  svg.appendChild(el('circle', { cx: x(d), cy: y(lleva[d]), r: 3.5, class: 'fc-curva-punto-real' }));
  svg.appendChild(el('circle', { cx: x(d), cy: y(est[d]), r: 4.5, class: 'fc-curva-punto' }));
  svg.appendChild(el('text', { x: x(dias) - 12, y: y(real) - 10, 'text-anchor': 'end', class: 'fc-curva-valor' },
    `cierre: ${fmtN.format(real)}`));
  caja.appendChild(svg);

  const clave = document.createElement('p');
  clave.className = 'fc-curva-clave';
  clave.setAttribute('aria-hidden', 'true');
  for (const [cls, txt] of [['fc-curva-clave-mes', 'Lo que estimaba ese día'],
    ['fc-curva-clave-real', 'Lo que llevaban']]) {
    const sp = document.createElement('span');
    sp.className = cls;
    sp.textContent = txt;
    clave.appendChild(sp);
  }
  caja.appendChild(clave);
}

$('#fc-dias').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dia]');
  if (!b) return;
  diaFc = Number(b.dataset.dia);
  pintarForecast();
});

function gruposFc(filas, nivel) {
  const sucFija = Boolean($('#fc-f-sucursal').value) || new Set(filas.map((r) => r.sucursal)).size === 1;
  const gerFijo = Boolean($('#fc-f-gerente').value) || new Set(filas.map((r) => r.gerente)).size === 1;
  const grupos = new Map();
  for (const r of filas) {
    const clave = nivel === 'asesor' ? `${r.apv_id}|${r.sucursal}` : r[nivel];
    if (!grupos.has(clave)) grupos.set(clave, { clave, filas: [], fila: r });
    grupos.get(clave).filas.push(r);
  }
  return [...grupos.values()].map((g) => {
    const t = totalesForecast(g.filas);
    let nombre;
    let sub;
    if (nivel === 'asesor') {
      nombre = g.fila.asesor;
      sub = [sucFija ? null : g.fila.sucursal, gerFijo ? null : g.fila.gerente].filter(Boolean).join(' · ');
    } else if (nivel === 'gerente') {
      nombre = g.clave;
      const sucs = [...new Set(g.filas.map((x) => x.sucursal))];
      sub = [sucFija ? null : sucs.join(', '), `${t.asesores} asesor${t.asesores === 1 ? '' : 'es'}`].filter(Boolean).join(' · ');
    } else {
      nombre = g.clave;
      const gers = new Set(g.filas.map((x) => x.gerente)).size;
      sub = `${gers} gerente${gers === 1 ? '' : 's'} · ${t.asesores} asesor${t.asesores === 1 ? '' : 'es'}`;
    }
    return { ...g, t, nombre, sub };
  });
}

function valorOrdenFc(t, campo) {
  if (campo === 'estimado') return t.pct;
  if (campo === 'real' && esCerrado()) return t.pctReal;
  if (campo === 'objetivo') return t.objetivo || null;
  return t[campo];
}

function avanceIncompleto() {
  return Boolean(forecast.avance) && forecast.avance.fraccion < 1;
}

function pintarTablaFc(filas) {
  const nivel = nivelFc || nivelPorOmision(filas);
  $('#fc-tabla-t').textContent = esCerrado() ? 'Estimado contra real por' : 'Cierre estimado por';

  $('#vista-forecast .fc-clave').hidden = esCerrado();
  $$('#fc-nivel [data-nivel]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.nivel === nivel)));

  const grupos = gruposFc(filas, nivel);
  const cols = [{ campo: 'nombre', titulo: { sucursal: 'Sucursal', gerente: 'Gerente', asesor: 'Asesor' }[nivel] }, ...columnasFc()];

  if (!cols.some((c) => c.campo === ordenFc.campo)) ordenFc = { campo: esCerrado() ? 'real' : 'estimado', desc: true };
  const { campo, desc } = ordenFc;
  grupos.sort((a, b) => {
    if (campo === 'nombre') return (desc ? -1 : 1) * a.nombre.localeCompare(b.nombre, 'es');
    const va = valorOrdenFc(a.t, campo);
    const vb = valorOrdenFc(b.t, campo);
    if (va === null && vb === null) return a.nombre.localeCompare(b.nombre, 'es');
    if (va === null) return 1;
    if (vb === null) return -1;
    return desc ? vb - va : va - vb;
  });

  const tabla = $('#fc-tabla');
  tabla.replaceChildren();
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  for (const col of cols) {
    const th = document.createElement('th');
    th.scope = 'col';
    if (col.campo !== 'nombre') th.className = 'db-col-num';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'db-orden';
    b.dataset.campo = col.campo;
    b.textContent = col.titulo;
    if (ordenFc.campo === col.campo) {
      th.setAttribute('aria-sort', ordenFc.desc ? 'descending' : 'ascending');
      const flecha = document.createElement('span');
      flecha.setAttribute('aria-hidden', 'true');
      flecha.textContent = ordenFc.desc ? ' ↓' : ' ↑';
      b.appendChild(flecha);
    }
    th.appendChild(b);
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  tabla.appendChild(thead);

  const tbody = document.createElement('tbody');
  if (!grupos.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = cols.length;
    td.className = 'vacio';
    td.textContent = forecast.motivo || 'No hay asesores con objetivo ni asignación en este mes.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  const siguiente = SIGUIENTE_NIVEL[nivel];
  for (const g of grupos) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'db-nombre';

    const nom =  (document.createElement(siguiente ? 'button' : 'span'));
    nom.className = 'db-nombre-principal';
    nom.textContent = g.nombre;
    if (siguiente) {
      nom.type = 'button';
      nom.dataset.baja = nivel;
      nom.dataset.valor = g.clave;
      nom.title = `Ver ${siguiente === 'gerente' ? 'los gerentes' : 'los asesores'} de ${g.nombre}`;
      const flecha = document.createElement('span');
      flecha.className = 'db-flecha';
      flecha.setAttribute('aria-hidden', 'true');
      flecha.textContent = '›';
      nom.appendChild(flecha);
    }
    th.appendChild(nom);
    if (g.sub) {
      const sub = document.createElement('span');
      sub.className = 'db-nombre-sub';
      sub.textContent = g.sub;
      th.appendChild(sub);
    }
    if (nivel === 'asesor') {
      const r = g.fila;
      const marcas = [];
      if (!r.con_objetivo) marcas.push('Sin objetivo');
      if (r.multi_agencia) marcas.push('Multi-agencia: lo real suma todas sus agencias');

      if (r.sin_historia && avanceIncompleto()) {
        marcas.push(`Sin ventas en ${mesesCortos(forecast.historia)}: el estimado es solo lo que lleva`);
      }
      if (marcas.length) {
        const caja = document.createElement('span');
        caja.className = 'db-marcas';
        for (const texto of marcas) {
          const m = document.createElement('span');
          m.className = 'db-marca';
          m.textContent = texto;
          caja.appendChild(m);
        }
        th.appendChild(caja);
      }
    }
    tr.appendChild(th);
    for (const td of celdasFc(g.t)) tr.appendChild(td);
    tbody.appendChild(tr);
  }
  tabla.appendChild(tbody);

  if (grupos.length > 1) {
    const tfoot = document.createElement('tfoot');
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.className = 'db-nombre';
    th.textContent = 'Total';
    tr.appendChild(th);
    for (const td of celdasFc(totalesForecast(filas))) tr.appendChild(td);
    tfoot.appendChild(tr);
    tabla.appendChild(tfoot);
  }
}

function celdasFc(t) {
  const celda = (etiqueta, clase) => {
    const td = document.createElement('td');
    td.className = `db-celda ${clase}`;
    td.dataset.etiqueta = etiqueta;
    return td;
  };
  const num = (v) => (v === null ? '—' : fmtN.format(v));

  const obj = celda('Objetivo', 'fc-num');
  obj.textContent = t.objetivo ? fmtN.format(t.objetivo) : '—';

  if (esCerrado()) {
    const real = celda('Cierre real', 'fc-est');
    const cifraR = document.createElement('span');
    cifraR.className = 'db-pct';
    cifraR.textContent = num(t.real);
    if (tono(t.pctReal)) cifraR.dataset.tono = tono(t.pctReal);
    const pctR = document.createElement('span');
    pctR.className = 'db-cifras';
    pctR.textContent = t.pctReal === null ? (t.objetivo ? '' : 'sin objetivo') : `${fmtP.format(t.pctReal)} del objetivo`;
    real.append(cifraR, pctR, barraForecast(comoReal(t), 'fc-barra fc-barra-chica'));

    const estD = celda(`Estimado ${alDia()}`, 'fc-num');
    estD.textContent = num(t.estimadoDia);
    const err = celda('Diferencia', 'fc-num fc-dif');
    err.textContent = t.error === null ? '—' : firmado(t.error);
    err.title = 'Estimado menos real: negativo es que se quedó corto';
    if (tonoPrecision(t.error, t.real)) err.dataset.tono = tonoPrecision(t.error, t.real);
    return [obj, real, estD, err];
  }

  const lleva = celda('Llevan', 'fc-num');
  lleva.textContent = num(t.real);

  const est = celda('Cierre estimado', 'fc-est');
  const cifra = document.createElement('span');
  cifra.className = 'db-pct';
  cifra.textContent = num(t.estimado);
  if (tono(t.pct)) cifra.dataset.tono = tono(t.pct);
  const pct = document.createElement('span');
  pct.className = 'db-cifras';
  pct.textContent = t.pct === null ? (t.objetivo ? '' : 'sin objetivo') : `${fmtP.format(t.pct)} del objetivo`;
  est.append(cifra, pct, barraForecast(t, 'fc-barra fc-barra-chica'));

  const dif = celda('Contra objetivo', 'fc-num fc-dif');
  dif.textContent = t.diferencia === null ? '—' : firmado(t.diferencia);
  if (t.diferencia !== null) dif.dataset.tono = t.diferencia >= 0 ? 'ok' : tono(t.pct);
  return [obj, lleva, est, dif];
}

$('#fc-tabla').addEventListener('click', (e) => {
  const orden = e.target.closest('.db-orden');
  if (orden) {
    const campo = orden.dataset.campo;
    ordenFc = ordenFc.campo === campo
      ? { campo, desc: !ordenFc.desc }
      : { campo, desc: campo !== 'nombre' };
    pintarForecast();
    return;
  }
  const baja = e.target.closest('[data-baja]');
  if (!baja) return;
  const sel = baja.dataset.baja === 'sucursal' ? $('#fc-f-sucursal') : $('#fc-f-gerente');
  if ([...sel.options].some((o) => o.value === baja.dataset.valor)) sel.value = baja.dataset.valor;
  nivelFc = SIGUIENTE_NIVEL[baja.dataset.baja];
  pintarFiltrosForecast();
  pintarForecast();
  $('#fc-tabla').closest('.db-tabla-caja').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

arrancar().catch((err) => { mostrarLogin(); errorLogin(err.message); });
