/*
 * Backend de DEMOSTRACION, dentro del navegador.
 *
 * El frontend real habla con `/api/*` (un BFF en Vercel que reenvia a un
 * Express). Aqui se intercepta `fetch` y se responde con la misma forma de JSON,
 * sobre datos ficticios guardados en localStorage. Ninguna peticion sale de la
 * pagina.
 *
 * Lo que se reproduce a proposito, porque es el punto del proyecto:
 *   - el alcance por rol se decide AQUI (el "servidor"), no en la pantalla;
 *   - la ventana de captura se re-evalua renglon por renglon al guardar;
 *   - una asignacion nunca se reactiva: rotar o volver inserta un periodo nuevo;
 *   - un APV no puede tener dos gerentes vivos en la misma agencia;
 *   - el gerente no arma su equipo (403), solo RH y admin;
 *   - reabrir un mes es solo del admin, para un gerente, con motivo y rastro.
 */
(function () {
  'use strict';

  const D = window.DEMO;
  const { RELOJ, idx, deIdx, diasDelMes, iso, calculados } = D;
  const LS_ESTADO = 'objetivos-apv-demo:estado';
  const LS_SESION = 'objetivos-apv-demo:sesion';
  const VERSION = 4;

  /* --------------------------------- estado -------------------------------- */

  const leerLS = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const escribirLS = (k, v) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };
  const borrarLS = (k) => { try { localStorage.removeItem(k); } catch { /* nada */ } };

  function cargarEstado() {
    try {
      const e = JSON.parse(leerLS(LS_ESTADO) || 'null');
      if (e && e.version === VERSION && e.semillaMes === `${RELOJ.anio}-${D.pad(RELOJ.mes)}`) return e;
    } catch { /* se vuelve a sembrar */ }
    return D.semilla();
  }
  let E = cargarEstado();
  const guardar = () => escribirLS(LS_ESTADO, JSON.stringify(E));
  guardar();

  let sesion = null;
  try { sesion = JSON.parse(leerLS(LS_SESION) || 'null'); } catch { sesion = null; }

  /* -------------------------------- utilidades ------------------------------ */

  const ahoraIso = () => new Date().toISOString();
  const nombreApv = (id) => (E.apv.find((a) => a.apv_id === id) || {}).nombre || `APV ${id}`;
  const gerentePorId = (id) => E.gerentes.find((g) => g.gerente_id === id);
  const nombreGerente = (id) => (gerentePorId(id) || {}).nombre || 'Sin gerente';
  const enCatalogo = (s) => E.sucursales.some((x) => x.SUCURSAL === s);
  const vivas = () => E.asignaciones.filter((a) => !a.vigente_hasta);
  const porNombre = (a, b) => a.localeCompare(b, 'es');

  class HttpError extends Error {
    constructor(status, cuerpo) { super(cuerpo.error || `Error ${status}`); this.status = status; this.cuerpo = cuerpo; }
  }
  const falla = (status, error, extra = {}) => { throw new HttpError(status, { error, ...extra }); };

  /* --------------------------------- actor ---------------------------------- */

  function actor() {
    if (!sesion) falla(401, 'Sin sesión');
    const m = E.miembros.find((x) => x.usuario === sesion.usuario);
    if (!m || !m.activo) { sesion = null; borrarLS(LS_SESION); falla(401, 'Sin sesión'); }
    const rol = m.rol === 'admin' ? 'admin' : (m.rol === 'rh' ? 'rh' : 'gerente');
    const g = rol === 'gerente' ? E.gerentes.find((x) => x.usuario === m.usuario && x.activo) : null;
    const sucursales = rol === 'rh'
      ? [...new Set(E.rh.filter((r) => r.usuario === m.usuario && r.activo).map((r) => r.sucursal))].sort()
      : [];
    return {
      usuario: m.usuario, rol,
      esAdmin: rol === 'admin', esRh: rol === 'rh',
      gerenteId: g ? g.gerente_id : null, gerenteNombre: g ? g.nombre : null,
      sucursales,
    };
  }

  /** La UNICA regla de alcance: la usan lecturas y escrituras por igual. */
  function alcanza(act, fila) {
    if (act.esAdmin) return true;
    if (act.esRh) return act.sucursales.includes(fila.sucursal);
    return act.gerenteId !== null && fila.gerente_id === act.gerenteId;
  }
  /** Un gerente es "de" un RH si nomina lo ubica en alguna de sus agencias. */
  const gerenteAlcanzable = (act, g) => act.esAdmin || (act.esRh && g.sucursales.some((s) => act.sucursales.includes(s)));
  const mueveEquipo = (act) => {
    if (!act.esAdmin && !act.esRh) {
      falla(403, 'Armar el equipo es de Recursos Humanos o de un administrador. Pide el movimiento a tu RH.');
    }
  };

  /* ---------------------------- ventana de captura -------------------------- */

  const dentroDeVentana = (anio, mes) => idx(anio, mes) >= RELOJ.i0;
  const tieneApertura = (gid, anio, mes) => E.aperturas.some((a) => a.activa && a.gerente_id === gid && a.anio === anio && a.mes === mes);
  function puedeCapturar(anio, mes, apertura) {
    if (dentroDeVentana(anio, mes)) return { puede: true, motivo: null };
    if (apertura) return { puede: true, motivo: null };
    return { puede: false, motivo: 'El mes ya cerró. Un administrador tiene que reabrirlo para ti.' };
  }
  const periodoValido = (anio, mes) => Number.isInteger(anio) && Number.isInteger(mes) && mes >= 1 && mes <= 12 && anio >= 2020 && anio <= 2100;

  /* ------------------------------- lo "real" -------------------------------- */

  function rangoMes(anio, mes) {
    return { desde: iso(anio, mes, 1), hasta: iso(anio, mes, diasDelMes(anio, mes)) };
  }
  /** Agencias en que la persona estuvo asignada algun dia del mes. */
  function agenciasDelMes(apvId, i) {
    const { anio, mes } = deIdx(i);
    const r = rangoMes(anio, mes);
    return [...new Set(E.asignaciones
      .filter((a) => a.apv_id === apvId && a.vigente_desde <= r.hasta && (!a.vigente_hasta || a.vigente_hasta >= r.desde))
      .map((a) => a.sucursal))];
  }
  const corteIdx = () => idx(Number(RELOJ.corte.slice(0, 4)), Number(RELOJ.corte.slice(5, 7)));
  function diaCorte(i) {
    const c = corteIdx();
    if (i < c) return diasDelMes(deIdx(i).anio, deIdx(i).mes);
    if (i === c) return Number(RELOJ.corte.slice(8, 10));
    return 0;
  }
  function ventas(apvId, i) {
    const ag = agenciasDelMes(apvId, i);
    return D.ventasMes(apvId, i, ag.length > 0, ag.length > 1);
  }
  /** Lo real de una persona en el mes, hasta el corte del DMS. null = no aparece en las fuentes. */
  function realPersona(apvId, i) {
    if (E.sinFuente.includes(apvId)) return null;
    const v = ventas(apvId, i);
    const hasta = diaCorte(i);
    let facturas = 0;
    for (let d = 1; d <= hasta; d++) facturas += v.porDia[d];
    const fq = v.total ? facturas / v.total : 0;
    const fc = Math.min(1, hasta / v.dias + (hasta ? 1 / v.dias : 0));
    return {
      prospectos: Math.round(v.rubros.prospectos * fc),
      demos: Math.round(v.rubros.demos * fc),
      solicitudes: Math.round(v.rubros.solicitudes * fc),
      crednissa: Math.round(v.rubros.crednissa * fq),
      facturas,
      entregas: Math.min(facturas, Math.round(v.rubros.entregas * fq)),
    };
  }

  /* -------------------------------- universo -------------------------------- */

  /** "De quien era este mes": objetivos del mes + asignaciones vigentes sin objetivo. */
  function universo(act, anio, mes) {
    const r = rangoMes(anio, mes);
    const obj = E.objetivos.filter((o) => o.anio === anio && o.mes === mes).map((o) => ({
      apv_id: o.apv_id, sucursal: o.sucursal, gerente_id: o.gerente_id,
      prospectos: o.prospectos, demos: o.demos, solicitudes: o.solicitudes,
      crednissa: o.crednissa, facturas: o.facturas, entregas: o.entregas, con_objetivo: true,
    }));
    const tiene = new Set(obj.map((o) => `${o.apv_id}|${o.sucursal}`));
    const porPar = new Map();
    for (const a of E.asignaciones) {
      if (!(a.vigente_desde <= r.hasta && (!a.vigente_hasta || a.vigente_hasta >= r.desde))) continue;
      const k = `${a.apv_id}|${a.sucursal}`;
      if (tiene.has(k)) continue;
      const p = porPar.get(k);
      if (!p || a.vigente_desde > p.vigente_desde || (a.vigente_desde === p.vigente_desde && a.asignacion_id > p.asignacion_id)) porPar.set(k, a);
    }
    const sin = [...porPar.values()].map((a) => ({
      apv_id: a.apv_id, sucursal: a.sucursal, gerente_id: a.gerente_id,
      prospectos: 0, demos: 0, solicitudes: 0, crednissa: 0, facturas: 0, entregas: 0, con_objetivo: false,
    }));
    return [...obj, ...sin]
      .filter((u) => alcanza(act, u))
      .map((u) => ({ ...u, asesor: nombreApv(u.apv_id), gerente: nombreGerente(u.gerente_id) }))
      .sort((a, b) => porNombre(a.sucursal, b.sucursal) || porNombre(a.gerente, b.gerente) || porNombre(a.asesor, b.asesor));
  }

  /* ------------------------------- forecast --------------------------------- */

  const cacheCompania = new Map();
  function companiaPorDia(i) {
    if (cacheCompania.has(i)) return cacheCompania.get(i);
    const { anio, mes } = deIdx(i);
    const dias = diasDelMes(anio, mes);
    const suma = new Array(dias + 1).fill(0);
    for (const a of E.apv) {
      const v = ventas(a.apv_id, i);
      for (let d = 1; d <= dias; d++) suma[d] += v.porDia[d];
    }
    cacheCompania.set(i, suma);
    return suma;
  }
  function curvaCierre(meses, dias) {
    const suma = new Array(dias + 1).fill(0);
    let n = 0;
    for (const i of meses) {
      const f = companiaPorDia(i);
      const total = f.reduce((x, y) => x + y, 0);
      if (!total) continue;
      const suyos = f.length - 1;
      const acum = [0];
      for (let d = 1; d <= suyos; d++) acum[d] = acum[d - 1] + f[d];
      for (let d = 1; d <= dias; d++) suma[d] += acum[Math.max(0, suyos - (dias - d))] / total;
      n++;
    }
    const curva = suma.map((s, d) => (n ? s / n : d / dias));
    curva[0] = 0;
    return { curva, meses: n };
  }
  function avanceAlCorte(anio, mes, curva) {
    const dias = diasDelMes(anio, mes);
    const pedido = idx(anio, mes);
    const c = corteIdx();
    if (pedido < c) return { dia: dias, dias, fraccion: 1 };
    if (pedido > c) return { dia: 0, dias, fraccion: 0 };
    const dia = Number(RELOJ.corte.slice(8, 10));
    return { dia, dias, fraccion: dia >= dias ? 1 : Math.min(curva[dia], 1) };
  }
  const estimar = (real, prom, fr) => (real === null || prom === null || fr === null ? null : real + (1 - fr) * prom);

  function forecast(act, anio, mes) {
    const i = idx(anio, mes);
    const ultimo = Math.min(i, RELOJ.i0) - 1;
    const a3 = deIdx(ultimo - 2);
    const b3 = deIdx(ultimo);
    const historia = { desde: rangoMes(a3.anio, a3.mes).desde, hasta: rangoMes(b3.anio, b3.mes).hasta };
    const base = { anio, mes, historia };
    const filas = universo(act, anio, mes);
    if (!filas.length) {
      return { ...base, rows: [], fuente: { ok: true, error: null },
        ...(act.esRh && !act.sucursales.length ? { motivo: 'No tienes agencias asignadas' } : {}) };
    }
    const mesesCurva = [];
    for (let k = ultimo - 11; k <= ultimo; k++) mesesCurva.push(k);
    const dias = diasDelMes(anio, mes);
    const { curva, meses } = curvaCierre(mesesCurva, dias);
    const avance = avanceAlCorte(anio, mes, curva);
    const cerrado = avance.fraccion === 1;

    const agencias = new Map();
    for (const f of filas) agencias.set(f.apv_id, (agencias.get(f.apv_id) || 0) + 1);
    const rows = filas.map((f) => {
      const real = realPersona(f.apv_id, i);
      let suma = 0;
      for (let k = ultimo - 2; k <= ultimo; k++) suma += (E.sinFuente.includes(f.apv_id) ? 0 : ventas(f.apv_id, k).total);
      const promedio = suma / 3;
      const r = {
        apv_id: f.apv_id, asesor: f.asesor, sucursal: f.sucursal, gerente_id: f.gerente_id, gerente: f.gerente,
        con_objetivo: f.con_objetivo, multi_agencia: agencias.get(f.apv_id) > 1, sin_historia: promedio === 0,
        objetivo: f.facturas, real: real ? real.facturas : 0, promedio,
        estimado: estimar(real ? real.facturas : 0, promedio, avance.fraccion),
      };
      if (cerrado) {
        const v = E.sinFuente.includes(f.apv_id) ? { porDia: new Array(dias + 1).fill(0) } : ventas(f.apv_id, i);
        const acumulado = [0];
        for (let d = 1; d <= dias; d++) acumulado[d] = acumulado[d - 1] + v.porDia[d];
        r.acumulado = acumulado;
        r.estimado_por_dia = acumulado.map((x, d) => {
          const e = estimar(x, promedio, d >= dias ? 1 : Math.min(curva[d], 1));
          return e === null ? null : Math.round(e * 100) / 100;
        });
      }
      return r;
    });
    return {
      ...base, corte: RELOJ.corte, avance, meses_curva: meses, curva, rows,
      fuente: { ok: true, error: null }, retro: cerrado ? { ok: true, error: null } : null,
    };
  }

  /* ------------------------------- dashboard -------------------------------- */

  function dashboard(act, anio, mes) {
    const i = idx(anio, mes);
    const avance = i < RELOJ.i0 ? 1 : (i > RELOJ.i0 ? 0 : RELOJ.dia / diasDelMes(anio, mes));
    const filas = universo(act, anio, mes);
    const agencias = new Map();
    for (const f of filas) agencias.set(f.apv_id, (agencias.get(f.apv_id) || 0) + 1);
    const RUBROS = ['prospectos', 'demos', 'solicitudes', 'crednissa', 'facturas', 'entregas'];
    const rows = filas.map((f) => {
      const p = realPersona(f.apv_id, i);
      const objetivo = {};
      const real = {};
      for (const r of RUBROS) { objetivo[r] = f[r]; real[r] = p ? p[r] : 0; }
      const sinEmpate = !p || (p.facturas === 0 && p.prospectos === 0 && avance > 0.1);
      return {
        apv_id: f.apv_id, asesor: f.asesor, sucursal: f.sucursal, gerente_id: f.gerente_id, gerente: f.gerente,
        con_objetivo: f.con_objetivo, multi_agencia: agencias.get(f.apv_id) > 1, sin_empate: sinEmpate,
        objetivo, real,
      };
    });
    const ok = { ok: true, error: null };
    return {
      anio, mes, avance, rows, fuentes: { hubspot: ok, qvn: ok, incadea: ok },
      ...(act.esRh && !act.sucursales.length ? { motivo: 'No tienes agencias asignadas' } : {}),
    };
  }

  /* --------------------------------- rutas ---------------------------------- */

  const num = (v) => Number.parseInt(v, 10);
  const PASSWORD_ALFABETO = 'ABCDEFGHJKLMNPQRTUVWXYZabcdefghijkmnpqrstuvwxyz2346789!@#$%*+=?';
  function passwordProvisional() {
    const b = new Uint8Array(9);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => PASSWORD_ALFABETO[x % PASSWORD_ALFABETO.length]).join('');
  }

  function datos(metodo, ruta, q, cuerpo) {
    const act = actor();
    const seg = ruta.split('/').map(decodeURIComponent);

    /* ---- lecturas ---- */
    if (metodo === 'GET' && ruta === 'contexto') {
      const g = act.gerenteId ? gerentePorId(act.gerenteId) : null;
      return {
        usuario: act.usuario, rol: act.rol, gerente_id: act.gerenteId, gerente_nombre: act.gerenteNombre,
        anio_actual: RELOJ.anio, mes_actual: RELOJ.mes,
        sin_alta: act.rol === 'gerente' && !act.gerenteId,
        sin_agencias: act.esRh && act.sucursales.length === 0,
        sucursales: act.sucursales,
        mis_sucursales: act.esAdmin ? null : (act.esRh ? act.sucursales : (g ? g.sucursales : [])),
      };
    }
    if (metodo === 'GET' && ruta === 'sucursales') return { rows: E.sucursales };
    if (metodo === 'GET' && ruta === 'nombres-fuente') return { disponible: true, rows: [] };

    if (metodo === 'GET' && ruta === 'objetivos') {
      const anio = num(q.get('anio'));
      const mes = num(q.get('mes'));
      if (!periodoValido(anio, mes)) falla(400, 'anio y mes son obligatorios');
      const asg = vivas().filter((a) => alcanza(act, a));
      const rows = asg.map((a) => {
        const o = E.objetivos.find((x) => x.apv_id === a.apv_id && x.sucursal === a.sucursal && x.anio === anio && x.mes === mes);
        const ap = tieneApertura(a.gerente_id, anio, mes);
        return {
          apv_id: a.apv_id, asesor: nombreApv(a.apv_id), sucursal: a.sucursal, gerente_id: a.gerente_id,
          gerente: o ? nombreGerente(o.gerente_id) : nombreGerente(a.gerente_id),
          gerente_cambio: Boolean(o && o.gerente_id !== a.gerente_id),
          asignacion_id: a.asignacion_id, objetivo_id: o ? o.objetivo_id : null,
          prospectos: o ? o.prospectos : 0, demos: o ? o.demos : 0, solicitudes: o ? o.solicitudes : 0,
          crednissa: o ? o.crednissa : 0, facturas: o ? o.facturas : 0, entregas: o ? o.entregas : 0,
          created_by: o ? o.created_by : null, created_at: o ? o.created_at : null,
          updated_by: o ? o.updated_by : null, updated_at: o ? o.updated_at : null,
          editable: puedeCapturar(anio, mes, ap).puede,
        };
      }).sort((x, y) => porNombre(x.sucursal, y.sucursal) || porNombre(x.asesor, y.asesor));
      const algunaApertura = [...new Set(asg.map((a) => a.gerente_id))].some((g) => tieneApertura(g, anio, mes));
      const global = puedeCapturar(anio, mes, algunaApertura);
      if (act.esRh && !act.sucursales.length) return { rows: [], editable: false, motivo: 'No tienes agencias asignadas' };
      return {
        rows, editable: global.puede, motivo: global.motivo, anio, mes,
        reabierto: global.puede && !dentroDeVentana(anio, mes),
      };
    }

    if (metodo === 'GET' && ruta === 'apv') {
      return {
        rows: vivas().filter((a) => alcanza(act, a)).map((a) => ({
          apv_id: a.apv_id, nombre: nombreApv(a.apv_id), asesor: nombreApv(a.apv_id), activo: true,
          asignacion_id: a.asignacion_id, sucursal: a.sucursal, gerente_id: a.gerente_id,
          gerente: nombreGerente(a.gerente_id), vigente_desde: a.vigente_desde,
        })).sort((x, y) => porNombre(x.asesor, y.asesor) || porNombre(x.sucursal, y.sucursal)),
      };
    }

    if (metodo === 'GET' && seg[0] === 'apv' && seg[2] === 'historial') {
      const id = num(seg[1]);
      const periodos = E.asignaciones.filter((a) => a.apv_id === id && alcanza(act, a))
        .sort((x, y) => (y.vigente_desde.localeCompare(x.vigente_desde)) || (y.asignacion_id - x.asignacion_id));
      return {
        rows: periodos.map((p) => ({
          asignacion_id: p.asignacion_id, sucursal: p.sucursal, gerente: nombreGerente(p.gerente_id),
          vigente_desde: p.vigente_desde, vigente_hasta: p.vigente_hasta, motivo_baja: p.motivo_baja,
          created_by: p.created_by, cerrada_by: p.cerrada_by,
          objetivos: E.objetivos
            .filter((o) => {
              if (o.apv_id !== id || o.sucursal !== p.sucursal) return false;
              const r = rangoMes(o.anio, o.mes);
              return p.vigente_desde <= r.hasta && (!p.vigente_hasta || p.vigente_hasta >= r.desde);
            })
            .sort((x, y) => (y.anio - x.anio) || (y.mes - x.mes))
            .map((o) => {
              const fin = rangoMes(o.anio, o.mes).hasta;
              return {
                objetivo_id: o.objetivo_id, anio: o.anio, mes: o.mes,
                prospectos: o.prospectos, demos: o.demos, solicitudes: o.solicitudes,
                crednissa: o.crednissa, facturas: o.facturas, entregas: o.entregas,
                created_at: o.created_at, created_by: o.created_by, updated_at: o.updated_at, updated_by: o.updated_by,
                gerente_objetivo: nombreGerente(o.gerente_id),
                vigente_al_cierre: p.vigente_desde <= fin && (!p.vigente_hasta || p.vigente_hasta >= fin),
                cambios: [...o.historial].reverse(),
              };
            }),
        })),
      };
    }

    if (metodo === 'GET' && ruta === 'candidatos') {
      const s = q.get('sucursal') || '';
      if (!act.esAdmin && !(act.esRh && act.sucursales.includes(s))) falla(403, 'Esa agencia no es tuya');
      const ocupados = new Set(vivas().filter((a) => a.sucursal === s).map((a) => nombreApv(a.apv_id)));
      return {
        disponible: true,
        rows: (E.candidatos[s] || []).filter((c) => !ocupados.has(c.ASESOR)).map((c) => ({
          ...c, YA_EN_CATALOGO: E.apv.some((a) => a.nombre === c.ASESOR),
        })),
      };
    }
    if (metodo === 'GET' && ruta === 'candidatos-gerente') {
      if (!act.esAdmin && !act.esRh) falla(403, 'Solo RH o un administrador registra gerentes');
      return {
        disponible: true,
        rows: E.candidatosGerente
          .filter((c) => !E.gerentes.some((g) => g.nombre === c.NOMBRE))
          .filter((c) => act.esAdmin || c.DONDE.split(', ').some((s) => act.sucursales.includes(s))),
      };
    }

    if (metodo === 'GET' && ruta === 'gerentes') {
      const fila = (g) => ({ gerente_id: g.gerente_id, usuario: g.usuario, nombre: g.nombre, activo: g.activo, sucursales: g.sucursales });
      if (act.esAdmin) return { rows: E.gerentes.map(fila).sort((a, b) => porNombre(a.nombre, b.nombre)), alcance: 'todo' };
      if (act.esRh) {
        if (!act.sucursales.length) return { rows: [], alcance: 'rh', motivo: 'No tienes agencias asignadas.' };
        return { rows: E.gerentes.filter((g) => gerenteAlcanzable(act, g)).map(fila).sort((a, b) => porNombre(a.nombre, b.nombre)), alcance: 'rh' };
      }
      const g = act.gerenteId ? gerentePorId(act.gerenteId) : null;
      return { rows: g ? [fila(g)] : [], alcance: 'propio' };
    }

    if (metodo === 'GET' && ruta === 'aperturas') {
      if (!act.esAdmin) falla(403, 'Solo un administrador ve las aperturas');
      return {
        rows: [...E.aperturas].sort((a, b) => b.autorizada_at.localeCompare(a.autorizada_at))
          .map((a) => ({ ...a, gerente: nombreGerente(a.gerente_id) })),
      };
    }

    if (metodo === 'GET' && ruta === 'usuarios-rh') {
      if (!act.esAdmin) falla(403, 'Solo un administrador ve los usuarios de RH');
      const rows = E.rh.filter((r) => r.activo)
        .sort((a, b) => porNombre(a.usuario, b.usuario) || porNombre(a.sucursal, b.sucursal));
      const conAgencia = new Set(rows.map((r) => r.usuario));
      const sinAgencias = E.miembros.filter((m) => m.rol === 'rh' && !conAgencia.has(m.usuario)).map((m) => ({
        usuario: m.usuario,
        created_at: ((E.rhSinAgencias || []).find((x) => x.usuario === m.usuario) || {}).created_at || m.created_at || ahoraIso(),
      }));
      return { rows, sinAgencias };
    }

    if (metodo === 'GET' && ruta === 'dashboard') {
      const anio = num(q.get('anio'));
      const mes = num(q.get('mes'));
      if (!periodoValido(anio, mes)) falla(400, 'anio y mes son obligatorios');
      return dashboard(act, anio, mes);
    }
    if (metodo === 'GET' && ruta === 'dashboard/facturas') {
      const anio = num(q.get('anio'));
      const mes = num(q.get('mes'));
      const apvId = num(q.get('apv_id'));
      if (!periodoValido(anio, mes) || !Number.isInteger(apvId)) falla(400, 'anio, mes y apv_id son obligatorios');
      if (!universo(act, anio, mes).some((u) => u.apv_id === apvId)) falla(404, 'No encontrado');
      const i = idx(anio, mes);
      if (E.sinFuente.includes(apvId)) return { ok: true, rows: [] };
      const v = ventas(apvId, i);
      return { ok: true, rows: D.autos(apvId, i, v.porDia, diaCorte(i), agenciasDelMes(apvId, i)) };
    }
    if (metodo === 'GET' && ruta === 'forecast') {
      const anio = num(q.get('anio'));
      const mes = num(q.get('mes'));
      if (!periodoValido(anio, mes)) falla(400, 'anio y mes son obligatorios');
      return forecast(act, anio, mes);
    }

    /* ---- escrituras ---- */
    if (metodo === 'PUT' && ruta === 'objetivos') {
      const anio = num(cuerpo.anio);
      const mes = num(cuerpo.mes);
      const filas = Array.isArray(cuerpo.filas) ? cuerpo.filas : null;
      if (!periodoValido(anio, mes) || !filas) falla(400, 'anio, mes y filas son obligatorios');
      let guardados = 0;
      const rechazados = [];
      for (const f of filas) {
        const apvId = num(f.apv_id);
        const a = vivas().find((x) => x.apv_id === apvId && x.sucursal === f.sucursal);
        // El alcance sale de la sesion, nunca del cuerpo: un apv_id ajeno se rechaza.
        if (!a || !alcanza(act, a)) { rechazados.push({ apv_id: apvId, sucursal: f.sucursal, motivo: 'no es de tu equipo en esa agencia' }); continue; }
        // La ventana se re-evalua aqui, renglon por renglon.
        const v = puedeCapturar(anio, mes, tieneApertura(a.gerente_id, anio, mes));
        if (!v.puede) { rechazados.push({ apv_id: apvId, sucursal: f.sucursal, motivo: v.motivo }); continue; }
        const facturas = Number(f.facturas);
        if (!Number.isInteger(facturas) || facturas < 0 || facturas > 5000) {
          rechazados.push({ apv_id: apvId, sucursal: f.sucursal, motivo: 'cifra fuera de rango' });
          continue;
        }
        // De los seis rubros se captura uno: los otros cinco se calculan aqui.
        const cifras = calculados(facturas);
        const t = ahoraIso();
        let o = E.objetivos.find((x) => x.apv_id === apvId && x.sucursal === a.sucursal && x.anio === anio && x.mes === mes);
        if (!o) {
          o = { objetivo_id: ++E.seq.objetivo, apv_id: apvId, sucursal: a.sucursal, anio, mes,
            gerente_id: a.gerente_id, ...cifras, created_by: act.usuario, created_at: t, updated_by: null, updated_at: null,
            historial: [{ accion: 'alta', por_usuario: act.usuario, at: t, ...cifras }] };
          E.objetivos.push(o);
        } else if (o.facturas !== facturas || o.gerente_id !== a.gerente_id) {
          Object.assign(o, cifras, { gerente_id: a.gerente_id, updated_by: act.usuario, updated_at: t });
          // La bitacora solo guarda lo que de verdad cambio.
          const ultimo = o.historial[o.historial.length - 1];
          if (!ultimo || ultimo.facturas !== facturas) o.historial.push({ accion: 'cambio', por_usuario: act.usuario, at: t, ...cifras });
        }
        guardados++;
      }
      guardar();
      return { guardados, rechazados };
    }

    if (metodo === 'POST' && ruta === 'apv') {
      mueveEquipo(act);
      const nombre = String(cuerpo.nombre || '').trim().toUpperCase();
      const sucursal = String(cuerpo.sucursal || '').trim();
      const gid = num(cuerpo.gerente_id);
      if (!nombre) falla(400, 'Falta el nombre del asesor');
      if (!enCatalogo(sucursal)) falla(400, 'Esa agencia no está en el catálogo');
      if (act.esRh && !act.sucursales.includes(sucursal)) falla(403, 'Esa agencia no es tuya');
      const g = gerentePorId(gid);
      if (!g || !g.activo) falla(400, 'Elige un gerente activo');
      if (act.esRh && !gerenteAlcanzable(act, g)) falla(403, 'Ese gerente no está en tus agencias');
      if (!act.esAdmin && !(E.candidatos[sucursal] || []).some((c) => c.ASESOR === nombre)) {
        falla(400, 'El alta está limitada al padrón de nómina de esa agencia');
      }
      const existe = E.apv.find((a) => a.nombre === nombre);
      if (existe) {
        falla(409, 'Ese asesor ya existe', {
          yaExiste: true, apv_id: existe.apv_id, asesor: existe.nombre,
          asignaciones: vivas().filter((a) => a.apv_id === existe.apv_id)
            .map((a) => ({ sucursal: a.sucursal, gerente: nombreGerente(a.gerente_id) })),
        });
      }
      const apvId = ++E.seq.apv;
      E.apv.push({ apv_id: apvId, nombre });
      E.asignaciones.push({ asignacion_id: ++E.seq.asignacion, apv_id: apvId, sucursal, gerente_id: gid,
        vigente_desde: RELOJ.hoy, vigente_hasta: null, motivo_baja: null, created_by: act.usuario, cerrada_by: null });
      const c = (E.candidatos[sucursal] || []).find((x) => x.ASESOR === nombre);
      if (c && c.EN_CRM === false) E.sinFuente.push(apvId);
      guardar();
      return [201, { ok: true, apv_id: apvId }];
    }

    if (metodo === 'POST' && ruta === 'asignaciones') {
      mueveEquipo(act);
      const apvId = num(cuerpo.apv_id);
      const sucursal = String(cuerpo.sucursal || '');
      const gid = num(cuerpo.gerente_id);
      if (!E.apv.some((a) => a.apv_id === apvId)) falla(404, 'Ese asesor no existe');
      if (!enCatalogo(sucursal)) falla(400, 'Esa agencia no está en el catálogo');
      if (act.esRh && !act.sucursales.includes(sucursal)) falla(403, 'Esa agencia no es tuya');
      const g = gerentePorId(gid);
      if (!g || !g.activo) falla(400, 'Elige un gerente activo');
      // UX_asig_abierta: dos gerentes vivos en la misma agencia dejarian el objetivo sin dueño.
      if (vivas().some((a) => a.apv_id === apvId && a.sucursal === sucursal)) {
        falla(409, 'Ese asesor ya tiene un gerente vivo en esa agencia. Cierra ese periodo primero.');
      }
      E.asignaciones.push({ asignacion_id: ++E.seq.asignacion, apv_id: apvId, sucursal, gerente_id: gid,
        vigente_desde: RELOJ.hoy, vigente_hasta: null, motivo_baja: null, created_by: act.usuario, cerrada_by: null });
      guardar();
      return [201, { ok: true }];
    }

    if (metodo === 'POST' && seg[0] === 'asignaciones' && seg[2] === 'cerrar') {
      mueveEquipo(act);
      const a = vivas().find((x) => x.asignacion_id === num(seg[1]));
      if (!a || !alcanza(act, a)) falla(404, 'Asignación no encontrada o ya cerrada');
      // Nunca se borra ni se reactiva: se cierra con fecha.
      Object.assign(a, { vigente_hasta: RELOJ.hoy, motivo_baja: String(cuerpo.motivo || '').trim() || null, cerrada_by: act.usuario });
      guardar();
      return { ok: true };
    }

    if (metodo === 'POST' && ruta === 'gerentes') {
      if (!act.esAdmin && !act.esRh) falla(403, 'Solo RH o un administrador registra gerentes');
      const usuario = String(cuerpo.usuario || '').trim().toLowerCase();
      const nombre = String(cuerpo.nombre || '').trim().toUpperCase();
      if (usuario.length < 3 || !nombre) falla(400, 'Faltan el usuario o el nombre');
      const cand = E.candidatosGerente.find((c) => c.NOMBRE === nombre);
      if (!cand && !act.esAdmin) falla(400, 'El alta está limitada al padrón de gerentes');
      const sucs = cand ? cand.DONDE.split(', ') : [];
      if (act.esRh && !sucs.some((s) => act.sucursales.includes(s))) falla(403, 'Ese gerente no está en tus agencias');
      if (E.gerentes.some((g) => g.nombre === nombre)) falla(409, 'Ya hay un gerente registrado con ese nombre');
      if (E.gerentes.some((g) => g.usuario === usuario)) falla(409, 'Ese usuario ya está registrado como gerente');
      E.gerentes.push({ gerente_id: ++E.seq.gerente, usuario, nombre, activo: true, sucursales: sucs });
      guardar();
      return [201, { ok: true }];
    }

    if (metodo === 'POST' && seg[0] === 'gerentes' && (seg[2] === 'baja' || seg[2] === 'reactivar')) {
      const g = gerentePorId(num(seg[1]));
      if (!g || !gerenteAlcanzable(act, g)) falla(404, 'Gerente no encontrado');
      if (seg[2] === 'baja') {
        const n = vivas().filter((a) => a.gerente_id === g.gerente_id).length;
        if (n) falla(409, `${g.nombre} todavía tiene ${n} APV asignado${n === 1 ? '' : 's'}. Pásalos a otro gerente o cierra sus periodos antes de darlo de baja.`);
        g.activo = false;
      } else {
        g.activo = true;
      }
      guardar();
      return { ok: true };
    }

    if (metodo === 'POST' && ruta === 'aperturas') {
      if (!act.esAdmin) falla(403, 'Solo un administrador reabre un mes');
      const anio = num(cuerpo.anio);
      const mes = num(cuerpo.mes);
      const gid = num(cuerpo.gerente_id);
      if (!periodoValido(anio, mes) || !gerentePorId(gid)) falla(400, 'anio, mes y gerente_id son obligatorios');
      if (dentroDeVentana(anio, mes)) falla(400, 'Ese mes todavía está abierto: no hace falta reabrirlo.');
      // UX_ap_viva: una sola apertura viva por gerente y mes.
      if (tieneApertura(gid, anio, mes)) falla(409, 'Ese mes ya esta abierto para ese gerente');
      const ap = {
        apertura_id: ++E.seq.apertura, anio, mes, gerente_id: gid, motivo: String(cuerpo.motivo || '').trim() || null,
        activa: true, autorizada_by: act.usuario, autorizada_at: ahoraIso(), cerrada_by: null, cerrada_at: null,
      };
      E.aperturas.push(ap);
      guardar();
      return [201, { apertura_id: ap.apertura_id }];
    }

    if (metodo === 'POST' && seg[0] === 'aperturas' && seg[2] === 'cerrar') {
      if (!act.esAdmin) falla(403, 'Solo un administrador cierra una apertura');
      const ap = E.aperturas.find((a) => a.apertura_id === num(seg[1]) && a.activa);
      if (!ap) falla(404, 'Apertura no encontrada o ya cerrada');
      Object.assign(ap, { activa: false, cerrada_by: act.usuario, cerrada_at: ahoraIso() });
      guardar();
      return { ok: true };
    }

    if (metodo === 'POST' && ruta === 'usuarios-rh') {
      if (!act.esAdmin) falla(403, 'Solo un administrador asigna agencias a RH');
      const usuario = String(cuerpo.usuario || '').trim().toLowerCase();
      const pedidas = Array.isArray(cuerpo.sucursales) ? cuerpo.sucursales : [];
      const agregadas = [];
      const yaTenia = [];
      const invalidas = [];
      for (const s of pedidas) {
        if (!enCatalogo(s)) { invalidas.push(s); continue; }
        if (E.rh.some((r) => r.usuario === usuario && r.sucursal === s && r.activo)) { yaTenia.push(s); continue; }
        E.rh.push({ usuario_rh_id: ++E.seq.rh, usuario, sucursal: s, activo: true, created_by: act.usuario, created_at: ahoraIso() });
        agregadas.push(s);
      }
      guardar();
      return [201, { agregadas, yaTenia, invalidas }];
    }

    if (metodo === 'PUT' && seg[0] === 'usuarios-rh' && seg[2] === 'sucursales') {
      if (!act.esAdmin) falla(403, 'Solo un administrador asigna agencias a RH');
      const usuario = seg[1];
      const quiere = new Set((Array.isArray(cuerpo.sucursales) ? cuerpo.sucursales : []).filter(enCatalogo));
      const tiene = E.rh.filter((r) => r.usuario === usuario && r.activo);
      const quitadas = [];
      const agregadas = [];
      for (const r of tiene) if (!quiere.has(r.sucursal)) { r.activo = false; r.quitada_by = act.usuario; quitadas.push(r.sucursal); }
      for (const s of quiere) {
        // Lo que ya estaba no se toca: conserva desde cuando cubre esa plaza.
        if (tiene.some((r) => r.sucursal === s)) continue;
        E.rh.push({ usuario_rh_id: ++E.seq.rh, usuario, sucursal: s, activo: true, created_by: act.usuario, created_at: ahoraIso() });
        agregadas.push(s);
      }
      guardar();
      return { agregadas, quitadas };
    }

    falla(404, 'No existe');
    return null;
  }

  /* ------------------------- BFF: sesion e identidad ------------------------ */

  function bff(metodo, ruta, cuerpo) {
    if (ruta === 'login') {
      const usuario = String(cuerpo.username || '').trim().toLowerCase();
      const m = E.miembros.find((x) => x.usuario === usuario && x.activo);
      if (!usuario || !String(cuerpo.password || '') || !m) {
        falla(401, 'Usuario o contraseña incorrectos. En la demo, usa los botones de abajo.');
      }
      sesion = { usuario: m.usuario };
      escribirLS(LS_SESION, JSON.stringify(sesion));
      return { ok: true, name: m.usuario, role: m.rol };
    }
    if (ruta === 'logout') { sesion = null; borrarLS(LS_SESION); return { ok: true }; }
    const act = actor();
    if (ruta === 'me') return { name: act.usuario, role: act.rol };
    if (ruta === 'accesos') {
      if (!act.esAdmin && !act.esRh) falla(403, 'No autorizado');
      return { miembros: E.miembros.map((m) => ({ usuario: m.usuario, activo: m.activo, rol: m.rol })) };
    }
    if (ruta === 'alta-usuario') {
      if (!act.esAdmin && !act.esRh) falla(403, 'No tienes permiso para dar de alta usuarios');
      const usuario = String(cuerpo.usuario || '').trim().toLowerCase();
      if (!usuario) falla(400, 'Falta el usuario');
      // El rol lo decide el BFF: un RH solo da de alta gerentes, nunca admin ni RH.
      let rol = cuerpo.rol === 'admin' ? 'admin' : (cuerpo.rol === 'rh' ? 'rh' : 'user');
      if (act.esRh) {
        rol = 'user';
        const nombre = String(cuerpo.nombre || '').trim().toUpperCase();
        const g = E.gerentes.find((x) => x.usuario === usuario);
        const cand = E.candidatosGerente.find((c) => c.NOMBRE === nombre);
        const suyo = (g && gerenteAlcanzable(act, g)) || (cand && cand.DONDE.split(', ').some((s) => act.sucursales.includes(s)));
        if (!suyo) falla(403, 'Ese gerente no está en tus agencias');
      }
      const existe = E.miembros.find((m) => m.usuario === usuario);
      if (existe) return [201, { ok: true, usuario, rol: existe.rol, password: null, ya_existia: true }];
      E.miembros.push({ usuario, rol, activo: true, provisional: true, created_at: ahoraIso() });
      guardar();
      return [201, { ok: true, usuario, rol, password: passwordProvisional(), ya_existia: false }];
    }
    if (ruta === 'restablecer-password') {
      if (!act.esAdmin && !act.esRh) falla(403, 'No tienes permiso para restablecer contraseñas');
      const usuario = String(cuerpo.usuario || '').trim().toLowerCase();
      const m = E.miembros.find((x) => x.usuario === usuario);
      if (!m) falla(404, 'Ese usuario no existe en la central');
      if (act.esRh) {
        const g = E.gerentes.find((x) => x.usuario === usuario);
        if (!g || !gerenteAlcanzable(act, g)) falla(403, 'Solo puedes restablecer a gerentes de tus agencias');
      }
      m.provisional = true;
      guardar();
      return { ok: true, usuario, password: passwordProvisional(), afecta_todas_las_apps: true };
    }
    falla(404, 'No existe');
    return null;
  }

  /* ----------------------------- intercepcion ------------------------------- */

  const fetchOriginal = window.fetch.bind(window);
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  window.fetch = async function (entrada, init = {}) {
    const url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
    if (!url.startsWith('/api/')) return fetchOriginal(entrada, init);

    const u = new URL(url, 'https://demo.invalid');
    const metodo = String(init.method || 'GET').toUpperCase();
    let cuerpo = {};
    try { cuerpo = init.body ? JSON.parse(init.body) : {}; } catch { cuerpo = {}; }
    await espera(90 + Math.random() * 120);

    let status = 200;
    let resp;
    try {
      const r = u.pathname.startsWith('/api/datos/')
        ? datos(metodo, u.pathname.slice('/api/datos/'.length), u.searchParams, cuerpo)
        : bff(metodo, u.pathname.slice('/api/'.length), cuerpo);
      if (Array.isArray(r)) [status, resp] = r; else resp = r;
    } catch (err) {
      if (!(err instanceof HttpError)) {
        console.warn('[demo] error interno', err);
        status = 500;
        resp = { error: 'Error interno de la demo' };
      } else {
        status = err.status;
        resp = err.cuerpo;
      }
    }
    return new Response(JSON.stringify(resp), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  };

  /* ------------------------------ piezas de demo ---------------------------- */

  const reset = document.getElementById('demo-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      borrarLS(LS_ESTADO);
      borrarLS(LS_SESION);
      location.reload();
    });
  }
  for (const b of document.querySelectorAll('.demo-rol')) {
    b.addEventListener('click', () => {
      document.getElementById('login-usuario').value = b.dataset.usuario;
      document.getElementById('login-password').value = 'demo';
      document.getElementById('form-login').requestSubmit();
    });
  }
})();
