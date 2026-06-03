import { ClinicalDocument, FamilyMember, MedicalHistoryEvent } from './models';

export interface DriveService {
  uploadDocument(memberId: string, file: { name: string; size: number; type: string }, description?: string): Promise<ClinicalDocument>;
  deleteDocument(documentId: string): Promise<void>;
}

export interface SheetsService {
  exportHistory(memberId: string, history: MedicalHistoryEvent[]): Promise<string>; // Returns Drive sheet URL
  exportFamilyMembers(members: FamilyMember[]): Promise<string>;
}
