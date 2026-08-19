export type RoomKind =
  | "house_consultorio"
  | "sublet_consultorio"
  | "pharmacy"
  | "procedure"
  | "reception";

export const ROOM_KIND_LABEL: Record<RoomKind, string> = {
  house_consultorio: "Consultório principal",
  sublet_consultorio: "Consultório sublocado",
  pharmacy: "Sala de Medicamentos",
  procedure: "Sala de Procedimentos",
  reception: "Recepção",
};

export type PhysicalRoom = {
  code: string;
  name: string;
  kind: RoomKind;
  occupant: string;
  note: string;
};

export const PHYSICAL_ROOMS: PhysicalRoom[] = [
  {
    code: "C1",
    name: "Consultório 1",
    kind: "house_consultorio",
    occupant: "Dra. Samara",
    note: "Ginecologia / Obstetrícia — casa",
  },
  {
    code: "C2",
    name: "Consultório 2",
    kind: "house_consultorio",
    occupant: "Dra. Thais",
    note: "Ginecologia / Obstetrícia — casa",
  },
  {
    code: "C3",
    name: "Consultório 3",
    kind: "sublet_consultorio",
    occupant: "Dr. Paulo Mendes",
    note: "Clínica geral — sublocação",
  },
  {
    code: "C4",
    name: "Consultório 4",
    kind: "sublet_consultorio",
    occupant: "Dra. Helena Dias",
    note: "Dermatologia — sublocação",
  },
  {
    code: "C5",
    name: "Consultório 5",
    kind: "sublet_consultorio",
    occupant: "Dr. Rafael Nunes",
    note: "Cardiologia — sublocação",
  },
  {
    code: "MED",
    name: "Sala de Medicamentos",
    kind: "pharmacy",
    occupant: "Gestão central",
    note: "Estoque clínico com lote e validade",
  },
  {
    code: "PROC",
    name: "Sala de Procedimentos",
    kind: "procedure",
    occupant: "Uso compartilhado",
    note: "Kits e insumos de procedimento",
  },
  {
    code: "REC",
    name: "Recepção",
    kind: "reception",
    occupant: "Secretarias",
    note: "Copa e material de escritório",
  },
];

export type RentalPreview = {
  room: string;
  tenant: string;
  specialty: string;
  monthlyReais: number;
  water: boolean;
  electricity: boolean;
  internet: boolean;
  until: string;
  lastStatement: string;
};

export const RENTAL_PREVIEW: RentalPreview[] = [
  {
    room: "Consultório 3",
    tenant: "Dr. Paulo Mendes",
    specialty: "Clínica geral",
    monthlyReais: 2800,
    water: true,
    electricity: true,
    internet: true,
    until: "31/12/2026",
    lastStatement: "Ago/2026 · R$ 2.800",
  },
  {
    room: "Consultório 4",
    tenant: "Dra. Helena Dias",
    specialty: "Dermatologia",
    monthlyReais: 3100,
    water: true,
    electricity: true,
    internet: true,
    until: "30/06/2027",
    lastStatement: "Ago/2026 · R$ 3.100",
  },
  {
    room: "Consultório 5",
    tenant: "Dr. Rafael Nunes",
    specialty: "Cardiologia",
    monthlyReais: 2950,
    water: true,
    electricity: true,
    internet: true,
    until: "31/03/2027",
    lastStatement: "Ago/2026 · R$ 2.950",
  },
];

export type StockRow = {
  name: string;
  sector: "pharmacy" | "procedure" | "reception";
  qtyLabel: string;
  minLabel: string;
  belowMin: boolean;
  linkedTo?: string;
};

export const STOCK_PREVIEW: StockRow[] = [
  {
    name: "Misoprostol 200 mcg",
    sector: "pharmacy",
    qtyLabel: "4 cp",
    minLabel: "mín. 10",
    belowMin: true,
  },
  {
    name: "Soro 0,9% 250 ml",
    sector: "pharmacy",
    qtyLabel: "3 un",
    minLabel: "mín. 8",
    belowMin: true,
  },
  {
    name: "Luvas M (lote A19)",
    sector: "procedure",
    qtyLabel: "1 cx",
    minLabel: "mín. 3",
    belowMin: true,
  },
  {
    name: "Campos estéreis",
    sector: "procedure",
    qtyLabel: "12 un",
    minLabel: "mín. 6",
    belowMin: false,
    linkedTo: "Procedimento · Dra. Samara",
  },
  {
    name: "Café",
    sector: "reception",
    qtyLabel: "2 kg",
    minLabel: "mín. 1",
    belowMin: false,
  },
];
