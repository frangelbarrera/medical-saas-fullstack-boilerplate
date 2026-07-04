/**
 * Domain types used by the frontend.
 *
 * NOTE: The backend (src/server/) uses its own types defined inline in route
 * handlers and middleware. These types are for the React components only.
 */

export interface Patient {
  id: string;
  dni?: string;
  name: string;
  age: number;
  doctor: string;
  status: "Active" | "Urgent" | "Inactive";
  lastVisit: string;
  cond: string;
  bloodType?: string;
  allergies?: string;
  allergiesList?: string[];
  hereditary?: string;
  insurance?: string;
  insuranceStatus?: "Active" | "Pre-authorization" | "Inactive";
  pathologicalHistory?: string;
  surgicalHistory?: string;
  lifestyle?: {
    smoking: "Never" | "Occasional" | "Frequent" | "Ex-smoker";
    alcohol: "Never" | "Occasional" | "Frequent";
    activity: "Sedentary" | "Moderate" | "Active";
    sleep: "Good" | "Regular" | "Poor";
  };
  latestVitals?: VitalSigns;
  vaccinations?: {
    name: string;
    date: string;
    dose?: string;
    notes?: string;
  }[];
  attachments?: {
    id: string;
    name: string;
    type: string;
    url: string;
    date: string;
    size?: string;
  }[];
}

export interface AuditLog {
  id: number;
  user: string;
  action: string;
  target: string;
  ip: string;
  ua: string;
  time: string;
  type: "read" | "write" | "create" | "export" | "alert" | "sign";
}

export interface VitalSigns {
  pulse: string;
  temp: string;
  bpS: string;
  bpD: string;
  weight: string;
  height: string;
  saturation?: string;
  respiratoryRate?: string;
  bmi?: string;
}

export interface PrescriptionItem {
  medication: string;
  dose: string;
  frequency: string;
  duration: string;
}

export interface Consultation {
  id: string;
  date: any;
  reason: string;
  evolution: string;
  vital_signs: VitalSigns;
  diagnosis_cie10: string;
  prescription: PrescriptionItem[];
  clinicId: string;
  doctorId: string;
  doctorName: string;
}
