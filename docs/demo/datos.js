/*
 * Datos FICTICIOS de la demo. Nada de esto sale de una base real: nombres,
 * agencias, cifras y VIN se inventan aqui, de forma determinista (misma semilla,
 * mismos datos), y relativos a la fecha de hoy para que siempre haya un mes en
 * curso, meses cerrados y un año de historia.
 *
 * Dos cosas distintas:
 *   - semilla(): el estado MUTABLE (catalogos, asignaciones, objetivos,
 *     aperturas...). mock.js lo guarda en localStorage y lo modifica.
 *   - reales: lo que "de verdad vendio" cada asesor. No se captura en la app
 *     (en produccion sale del CRM y del DMS), asi que aqui se calcula al vuelo
 *     y no se persiste.
 */
(function () {
  'use strict';

  /* ------------------------------- calendario ------------------------------- */

  const pad = (n) => String(n).padStart(2, '0');
  const idx = (anio, mes) => anio * 12 + (mes - 1);
  const deIdx = (i) => ({ anio: Math.floor(i / 12), mes: (i % 12) + 1 });
  const diasDelMes = (anio, mes) => new Date(anio, mes, 0).getDate();
  const iso = (anio, mes, dia) => `${anio}-${pad(mes)}-${pad(dia)}`;

  const ahora = new Date();
  const RELOJ = {
    anio: ahora.getFullYear(),
    mes: ahora.getMonth() + 1,
    dia: ahora.getDate(),
  };
  RELOJ.i0 = idx(RELOJ.anio, RELOJ.mes);
  RELOJ.hoy = iso(RELOJ.anio, RELOJ.mes, RELOJ.dia);
  const ayer = new Date(RELOJ.anio, RELOJ.mes - 1, RELOJ.dia - 1);
  // El "corte" del DMS: trae hasta ayer.
  RELOJ.corte = iso(ayer.getFullYear(), ayer.getMonth() + 1, ayer.getDate());

  /** Fecha relativa al mes en curso: off = 0 es este mes, -1 el anterior. */
  function fechaRel(off, dia) {
    const { anio, mes } = deIdx(RELOJ.i0 + off);
    const ult = diasDelMes(anio, mes);
    return iso(anio, mes, dia === 'fin' ? ult : Math.min(dia, ult));
  }
  function diaAntes(f) {
    const d = new Date(`${f}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  function diaDespues(f, n = 1) {
    const d = new Date(`${f}T12:00:00`);
    d.setDate(d.getDate() + n);
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  /** Instante ISO (UTC) de una fecha civil + hora local, nunca en el futuro. */
  function instante(fecha, hora, minuto) {
    const d = new Date(`${fecha}T${pad(hora)}:${pad(minuto)}:00`);
    const tope = Date.now() - 45 * 60 * 1000;
    return new Date(Math.min(d.getTime(), tope)).toISOString();
  }

  /* --------------------------- azar con semilla ---------------------------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(...partes) {
    let h = 2166136261;
    for (const p of partes) {
      const s = String(p);
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= 124; h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  const azar = (...k) => mulberry32(hash(...k));

  /* ------------------------------ la formula ------------------------------- */

  const redondea = (n, d) => Math.floor((n * 2 + d) / (d * 2));
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

  /* ------------------------------- catalogos ------------------------------- */

  const SUC = {
    N: 'AGENCIA NORTE',
    C: 'SUCURSAL CENTRO',
    B: 'PLAZA BAJIO',
    P: 'AGENCIA PONIENTE',
    O: 'SUCURSAL ORIENTE',
  };

  // Los gerentes NO tienen agencia en la base: `sucursales` es donde los ubica
  // nomina (el padron), que es lo que decide su alcance.
  const GERENTES = [
    { gerente_id: 1, usuario: 'laura.mendez', nombre: 'LAURA MENDEZ OROZCO', sucursales: [SUC.N, SUC.B] },
    { gerente_id: 2, usuario: 'ricardo.salazar', nombre: 'RICARDO SALAZAR PONCE', sucursales: [SUC.C] },
    { gerente_id: 3, usuario: 'adriana.fuentes', nombre: 'ADRIANA FUENTES ROBLES', sucursales: [SUC.C] },
    { gerente_id: 4, usuario: 'javier.cortes', nombre: 'JAVIER CORTES MEDINA', sucursales: [SUC.P] },
    { gerente_id: 5, usuario: 'patricia.luna', nombre: 'PATRICIA LUNA ESCOBAR', sucursales: [SUC.O] },
    { gerente_id: 6, usuario: 'oscar.villegas', nombre: 'OSCAR VILLEGAS TAPIA', sucursales: [SUC.B] },
    { gerente_id: 7, usuario: 'monica.herrera', nombre: 'MONICA HERRERA BRAVO', sucursales: [SUC.N] },
    { gerente_id: 8, usuario: 'ernesto.galindo', nombre: 'ERNESTO GALINDO RUIZ', sucursales: [SUC.P], activo: false },
  ];

  const NOMBRES_APV = [
    'ALEJANDRO RAMIREZ SOTO', 'BEATRIZ CASTILLO VEGA', 'CARLOS IBARRA NUNEZ', 'DANIELA ROJAS MEJIA',
    'EDUARDO PACHECO LARA', 'FERNANDA GUZMAN RIOS', 'GERARDO MOLINA AGUIRRE', 'HILDA CERVANTES PAZ',
    'IVAN DOMINGUEZ CRUZ', 'JIMENA ESTRADA LUGO', 'KEVIN ARELLANO SAENZ', 'LORENA BECERRA ZUNIGA',
    'MARIO DELGADO FRANCO', 'NATALIA OCHOA CAMPOS', 'OMAR VALENCIA REYES', 'PAOLA SANDOVAL MORA',
    'RAUL QUINTERO LEAL', 'SOFIA TREJO ACOSTA', 'TOMAS BARRERA GIL', 'URSULA MEDRANO SILVA',
    'VICTOR ZAVALA ROSAS', 'XIMENA PEREDA LOZANO', 'YAHIR CORONA MARQUEZ', 'ZAIRA ESPINOSA ROMO',
    'ANDRES VILLARREAL DIAZ', 'BRENDA OLVERA CHAVEZ', 'CESAR MALDONADO PENA', 'DIANA ARIAS BENITEZ',
    'EMILIO SOLIS CARDENAS', 'FABIOLA NIETO HUERTA', 'GUSTAVO RENTERIA ORTIZ', 'ISABEL PADILLA CORDERO',
    'JORGE LEDESMA VARGAS', 'KARINA MONTOYA ALVAREZ', 'LUIS ESCAMILLA PRADO', 'MARISOL ZEPEDA LUNA',
    'NICOLAS BUSTOS ARAIZA', 'OLGA TAPIA MENDOZA', 'PEDRO GAMEZ SALINAS', 'REBECA ULLOA FIERRO',
    'SAMUEL IRIGOYEN COTA',
  ];

  const RH_DE = { [SUC.N]: 'rh.bajio', [SUC.B]: 'rh.bajio', [SUC.C]: 'rh.centro', [SUC.O]: 'rh.centro', [SUC.P]: 'admin.demo' };

  /* --------------------------------- semilla -------------------------------- */

  function semilla() {
    const base = (apv) => fechaRel(-(16 + (apv % 14)), 1 + ((apv * 7) % 26));
    // La rotacion de este mes: despues de que el gerente anterior ya capturo.
    const ROT = RELOJ.dia > 5 ? fechaRel(0, Math.min(12, RELOJ.dia - 1)) : fechaRel(-1, 20);

    const asignaciones = [];
    let asgId = 100;
    const asigna = (apv, suc, ger, desde, hasta = null, motivo = null) => {
      asignaciones.push({
        asignacion_id: ++asgId, apv_id: apv, sucursal: suc, gerente_id: ger,
        vigente_desde: desde, vigente_hasta: hasta, motivo_baja: motivo,
        created_by: RH_DE[suc], cerrada_by: hasta ? RH_DE[suc] : null,
      });
    };

    // Laura: dos agencias. En NORTE recibe a la #8 a media captura del mes.
    for (const a of [1, 2, 3, 4]) asigna(a, SUC.N, 1, base(a));
    asigna(8, SUC.N, 7, base(8), diaAntes(ROT), 'Rotación de equipo');
    asigna(8, SUC.N, 1, ROT);
    for (const a of [6, 7]) asigna(a, SUC.B, 1, base(a));
    // Dos gerentes conviven en PLAZA BAJIO; la #5 paso de Oscar a Laura.
    asigna(5, SUC.B, 6, base(5), fechaRel(-2, 15), 'Rotación de equipo');
    asigna(5, SUC.B, 1, fechaRel(-2, 16));
    // Monica
    for (const a of [9, 10, 11, 12]) asigna(a, SUC.N, 7, base(a));
    // Ricardo y Adriana conviven en CENTRO; la #18 rota este mes.
    for (const a of [13, 14, 15, 16, 17]) asigna(a, SUC.C, 2, base(a));
    asigna(18, SUC.C, 2, base(18), diaAntes(ROT), 'Rotación de equipo');
    asigna(18, SUC.C, 3, ROT);
    for (const a of [19, 20, 21, 22, 40]) asigna(a, SUC.C, 3, base(a));
    // Oscar; la #3 trabaja tambien aqui (multi-agencia, con otro gerente).
    for (const a of [23, 24, 25, 26]) asigna(a, SUC.B, 6, base(a));
    asigna(3, SUC.B, 6, fechaRel(-9, 1));
    // PONIENTE: el equipo de Ernesto (ya dado de baja) paso a Javier.
    for (const a of [27, 28, 29]) {
      asigna(a, SUC.P, 8, base(a), fechaRel(-7, 'fin'), 'Reestructura de equipos');
      asigna(a, SUC.P, 4, fechaRel(-6, 1));
    }
    for (const a of [30, 31, 32]) asigna(a, SUC.P, 4, base(a));
    asigna(41, SUC.P, 4, base(41), fechaRel(-2, 10), 'Baja en nómina');
    // ORIENTE; la #34 cubre tambien CENTRO con Ricardo.
    for (const a of [33, 34, 35, 36, 37, 39]) asigna(a, SUC.O, 5, base(a));
    asigna(34, SUC.C, 2, fechaRel(-5, 1));
    // La #38 se fue de su plaza y regreso: tres periodos, ninguno reactivado.
    asigna(38, SUC.O, 5, fechaRel(-14, 1), fechaRel(-8, 15), 'Cambio de plaza');
    asigna(38, SUC.P, 4, fechaRel(-8, 16), fechaRel(-4, 'fin'), 'Regresa a su plaza');
    asigna(38, SUC.O, 5, fechaRel(-3, 1));

    const gerentes = GERENTES.map((g) => ({ activo: true, ...g }));
    const usuarioDe = (gid) => gerentes.find((g) => g.gerente_id === gid).usuario;

    /* ------------------------------ objetivos ------------------------------ */
    const SIN_CAPTURAR_HOY = new Set([4, 7, 12, 21, 31, 36]);
    const objetivos = [];
    let objId = 5000;
    const vigenteEn = (a, f) => a.vigente_desde <= f && (!a.vigente_hasta || a.vigente_hasta >= f);

    for (let k = -13; k <= 0; k++) {
      const { anio, mes } = deIdx(RELOJ.i0 + k);
      const vistos = new Set();
      for (const a of asignaciones) {
        const r = azar('cap', a.apv_id, a.sucursal, k);
        const dia = 2 + Math.floor(r() * 4);
        const cap = fechaRel(k, dia);
        if (!vigenteEn(a, cap)) continue;
        const clave = `${a.apv_id}|${a.sucursal}`;
        if (vistos.has(clave)) continue;
        if (k === 0 && (dia > RELOJ.dia || SIN_CAPTURAR_HOY.has(a.apv_id))) continue;
        // El mes reabierto de Oscar: le faltaron dos.
        if (k === -1 && a.gerente_id === 6 && [24, 25].includes(a.apv_id)) continue;
        vistos.add(clave);

        const potencial = 3 + (hash('base', a.apv_id) % 9);
        let meta = Math.max(1, Math.round(potencial * (0.85 + 0.35 * r())));
        const segunda = asignaciones.some((x) => x.apv_id === a.apv_id && x.sucursal !== a.sucursal && vigenteEn(x, cap) && x.asignacion_id < a.asignacion_id);
        if (segunda) meta = Math.max(1, Math.round(meta * 0.5));

        const quien = usuarioDe(a.gerente_id);
        const alta = instante(cap, 9 + Math.floor(r() * 8), Math.floor(r() * 60));
        const historial = [];
        let actual = meta;
        let cuando = alta;
        const conCambio = r() < 0.3 || (k === 0 && a.apv_id === 1);
        if (conCambio) {
          const inicial = Math.max(1, meta + (r() < 0.5 ? -1 : 1) * (1 + Math.floor(r() * 3)));
          historial.push({ accion: 'alta', por_usuario: quien, at: alta, ...calculados(inicial) });
          const f2 = diaDespues(cap, 1 + Math.floor(r() * 3));
          cuando = instante(f2, 10 + Math.floor(r() * 7), Math.floor(r() * 60));
          if (k === 0 && a.apv_id === 1) {
            const intermedio = Math.max(1, meta - 1);
            historial.push({ accion: 'cambio', por_usuario: quien, at: cuando, ...calculados(intermedio) });
            cuando = instante(diaDespues(f2, 1), 18, 5);
          }
          historial.push({ accion: 'cambio', por_usuario: quien, at: cuando, ...calculados(actual) });
        } else {
          historial.push({ accion: 'alta', por_usuario: quien, at: alta, ...calculados(actual) });
        }
        objetivos.push({
          objetivo_id: ++objId, apv_id: a.apv_id, sucursal: a.sucursal, anio, mes,
          gerente_id: a.gerente_id, ...calculados(actual),
          created_by: quien, created_at: alta,
          updated_by: historial.length > 1 ? quien : null,
          updated_at: historial.length > 1 ? cuando : null,
          historial,
        });
      }
    }

    /* ------------------------------ aperturas ------------------------------ */
    const m1 = deIdx(RELOJ.i0 - 1);
    const m3 = deIdx(RELOJ.i0 - 3);
    const aperturas = [
      {
        apertura_id: 12, anio: m1.anio, mes: m1.mes, gerente_id: 6,
        motivo: 'Faltaron dos asesores; el gerente estuvo de vacaciones al cierre.',
        activa: true, autorizada_by: 'admin.demo', autorizada_at: instante(fechaRel(0, Math.max(1, Math.min(3, RELOJ.dia))), 10, 12),
        cerrada_by: null, cerrada_at: null,
      },
      {
        apertura_id: 9, anio: m3.anio, mes: m3.mes, gerente_id: 4,
        motivo: 'Se capturó con el gerente anterior; se corrige la atribución.',
        activa: false, autorizada_by: 'admin.demo', autorizada_at: instante(fechaRel(-2, 2), 16, 40),
        cerrada_by: 'admin.demo', cerrada_at: instante(fechaRel(-2, 4), 12, 5),
      },
    ];

    /* ---------------------------- personal de RH --------------------------- */
    const rh = [];
    let rhId = 30;
    const rhAlta = (usuario, suc, off) => rh.push({
      usuario_rh_id: ++rhId, usuario, sucursal: suc, activo: true,
      created_by: 'admin.demo', created_at: instante(fechaRel(off, 8), 11, 20),
    });
    rhAlta('rh.centro', SUC.C, -11);
    rhAlta('rh.centro', SUC.O, -11);
    rhAlta('rh.bajio', SUC.B, -9);
    rhAlta('rh.bajio', SUC.N, -4);
    const rhSinAgencias = [{ usuario: 'rh.poniente', created_at: instante(fechaRel(-1, 22), 13, 0) }];

    /* -------------------- central de identidad (accesos) -------------------- */
    const miembros = [
      { usuario: 'admin.demo', rol: 'admin', activo: true },
      { usuario: 'rh.centro', rol: 'rh', activo: true },
      { usuario: 'rh.bajio', rol: 'rh', activo: true },
      { usuario: 'rh.poniente', rol: 'rh', activo: true },
      ...gerentes.map((g) => ({ usuario: g.usuario, rol: 'user', activo: g.activo })),
    ];

    /* ---------------------- padron de nomina (candidatos) ------------------- */
    const candidatos = {
      [SUC.N]: [
        { ASESOR: 'ARMANDO CISNEROS VELA', PUESTO: 'ASESOR DE VENTAS', EN_CRM: true },
        { ASESOR: 'LILIANA OROZCO PEREA', PUESTO: 'ASESOR DE VENTAS JR', EN_CRM: true },
      ],
      [SUC.B]: [
        // Ya existe en NORTE: darlo de alta aqui ofrece vincularlo.
        { ASESOR: 'DANIELA ROJAS MEJIA', PUESTO: 'ASESOR DE VENTAS', EN_CRM: true },
        { ASESOR: 'HUGO TELLEZ GARZA', PUESTO: 'ASESOR DE VENTAS', EN_CRM: true },
      ],
      [SUC.C]: [
        { ASESOR: 'ELENA MARIN SOSA', PUESTO: 'ASESOR DE VENTAS', EN_CRM: true },
        { ASESOR: 'ROBERTO AVILES CANO', PUESTO: 'ASESOR DE VENTAS', EN_CRM: false },
      ],
      [SUC.P]: [
        { ASESOR: 'FRANCISCO LUGO HARO', PUESTO: 'EJECUTIVO DE FLOTILLAS', EN_CRM: true },
      ],
      [SUC.O]: [],
    };
    const candidatosGerente = [
      { NOMBRE: 'SERGIO NAVARRO PENA', PUESTO: 'GERENTE COMERCIAL', AGENCIAS: 1, DONDE: SUC.O },
      { NOMBRE: 'VALERIA CAMACHO RIOS', PUESTO: 'GERENTE DE SEMINUEVOS', AGENCIAS: 2, DONDE: `${SUC.P}, ${SUC.N}` },
    ];

    return {
      version: 4,
      semillaMes: `${RELOJ.anio}-${pad(RELOJ.mes)}`,
      sucursales: Object.values(SUC).sort().map((s) => ({ SUCURSAL: s, GRUPO: 'RED DEMO' })),
      gerentes,
      apv: NOMBRES_APV.map((nombre, i) => ({ apv_id: i + 1, nombre })),
      asignaciones,
      objetivos,
      aperturas,
      rh,
      rhSinAgencias,
      miembros,
      candidatos,
      candidatosGerente,
      sinFuente: [],
      seq: { apv: 41, asignacion: asgId, objetivo: objId, apertura: 12, gerente: 8, rh: rhId },
    };
  }

  /* ------------------------------ lo "real" -------------------------------- */
  /*
   * Ventas por persona y por dia. La venta se carga al cierre del mes (como en
   * la vida real), y eso es justo lo que el Forecast tiene que aprender de la
   * historia: al dia 20 no va facturado el 67 % del mes.
   */

  const cacheMes = new Map();

  function pesoDia(d, dias) {
    const x = d / dias;
    return 0.55 + 2.6 * x ** 2.4 + (d === dias ? 3.2 : 0) + (d === dias - 1 ? 1.2 : 0);
  }

  /** {dias, porDia[1..dias], total, rubros} de una persona en un mes (indice absoluto). */
  function ventasMes(apvId, i, activo, multi) {
    const clave = `${apvId}|${i}|${activo ? 1 : 0}|${multi ? 1 : 0}`;
    if (cacheMes.has(clave)) return cacheMes.get(clave);
    const { anio, mes } = deIdx(i);
    const dias = diasDelMes(anio, mes);
    const porDia = new Array(dias + 1).fill(0);
    let total = 0;
    let rubros = { prospectos: 0, demos: 0, solicitudes: 0, crednissa: 0, entregas: 0 };
    if (activo) {
      const r = azar('real', apvId, i);
      const potencial = 3 + (hash('base', apvId) % 9);
      const f = 0.5 + 0.9 * ((r() + r() + r()) / 3);
      total = Math.max(0, Math.round(potencial * (multi ? 1.45 : 1) * f));
      const pesos = [];
      let suma = 0;
      for (let d = 1; d <= dias; d++) { pesos[d] = pesoDia(d, dias); suma += pesos[d]; }
      for (let u = 0; u < total; u++) {
        let x = r() * suma;
        let d = 1;
        while (d < dias && x > pesos[d]) { x -= pesos[d]; d++; }
        porDia[d] += 1;
      }
      const prospectos = Math.round(total * (4.2 + 2.4 * r()) + r() * 4);
      rubros = {
        prospectos,
        demos: Math.round(prospectos * (0.38 + 0.25 * r())),
        solicitudes: Math.round(prospectos * (0.55 + 0.3 * r())),
        crednissa: Math.round(prospectos * (0.45 + 0.3 * r())),
        entregas: Math.max(0, Math.round(total * (0.82 + 0.22 * r()))),
      };
    }
    const res = { dias, porDia, total, rubros };
    cacheMes.set(clave, res);
    return res;
  }

  /* --------------------------------- autos --------------------------------- */

  const MODELOS = [
    { modelo: 'SEDAN COMPACTO', versiones: ['SENSE MT', 'ADVANCE CVT', 'EXCLUSIVE CVT'], precio: 318000, vds: 'SC1' },
    { modelo: 'SUV COMPACTA', versiones: ['SENSE CVT', 'ADVANCE CVT', 'PLATINUM CVT'], precio: 452000, vds: 'UC2' },
    { modelo: 'SUV MEDIANA', versiones: ['ADVANCE 2 FILAS', 'EXCLUSIVE 3 FILAS'], precio: 705000, vds: 'UM3' },
    { modelo: 'PICKUP DOBLE CABINA', versiones: ['XE 4X2 MT', 'LE 4X4 AT'], precio: 598000, vds: 'PD4' },
    { modelo: 'HATCHBACK', versiones: ['SENSE MT', 'ADVANCE CVT'], precio: 289000, vds: 'HB5' },
    { modelo: 'VAN PASAJEROS', versiones: ['12 PASAJEROS', '15 PASAJEROS'], precio: 812000, vds: 'VP6' },
  ];
  const PESO_VIN = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  const TRANS = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const ANIO_VIN = 'ABCDEFGHJKLMNPRSTVWXY123456789';

  /** VIN con formato valido (17 caracteres y digito verificador), inventado. */
  function vin(modelo, anioModelo, serie, r) {
    const letra = () => 'ABCDEFGHJKLMNPRSTUVWXYZ'[Math.floor(r() * 23)];
    const anioCar = ANIO_VIN[(anioModelo - 2010) % 30];
    const cuerpo = `3DM${modelo.vds}${letra()}${letra()}0${anioCar}X${String(serie).padStart(6, '0')}`;
    let suma = 0;
    for (let i = 0; i < 17; i++) {
      const c = cuerpo[i];
      const v = /\d/.test(c) ? Number(c) : TRANS[c];
      suma += v * PESO_VIN[i];
    }
    const dv = suma % 11;
    return cuerpo.slice(0, 8) + (dv === 10 ? 'X' : String(dv)) + cuerpo.slice(9);
  }

  function autos(apvId, i, porDia, hastaDia, agencias) {
    const { anio, mes } = deIdx(i);
    const filas = [];
    let n = 0;
    for (let d = 1; d <= hastaDia; d++) {
      for (let u = 0; u < porDia[d]; u++) {
        const r = azar('auto', apvId, i, d, u);
        const m = MODELOS[Math.floor(r() * MODELOS.length)];
        const version = m.versiones[Math.floor(r() * m.versiones.length)];
        const anioModelo = mes >= 8 && r() < 0.7 ? anio + 1 : anio;
        const precio = Math.round((m.precio * (0.95 + 0.12 * r())) / 100) * 100;
        const bruta = Math.round(precio * (0.035 + 0.06 * r()));
        const total = Math.round(bruta - precio * (0.01 + 0.035 * r()));
        filas.push({
          vin: vin(m, anioModelo, 100000 + (hash('serie', apvId, i, d, u) % 899999), r),
          anio: anioModelo,
          modelo: m.modelo,
          unidad: `${m.modelo} ${version}`,
          factura: iso(anio, mes, d),
          precio_venta: precio,
          utilidad_bruta: bruta,
          utilidad_total: total,
          sucursal: agencias[Math.floor(r() * agencias.length)] || null,
        });
        n++;
      }
    }
    return filas;
  }

  window.DEMO = {
    RELOJ, SUC, idx, deIdx, diasDelMes, iso, pad, fechaRel, diaAntes, instante, hash, azar,
    calculados, semilla, ventasMes, autos,
  };
})();
