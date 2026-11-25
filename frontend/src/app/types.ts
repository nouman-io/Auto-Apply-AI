export interface Job {
  id: number;
  title: string;
  company: string;
  location?: string;
  country?: string;
  description?: string;
  url: string;
  apply_url?: string;
  apply_method?: "email" | "playwright";
  company_email?: string;
  salary?: string;
  source?: string;
  opportunity_type: "job" | "internship";
  match_score?: number;
  match_reasons?: string[];
  already_applied?: boolean;
  found_at?: string;
}

export interface Application {
  id: number;
  job_id?: number | null;
  title: string;
  company: string;
  company_email?: string;
  opportunity_type: string;
  apply_method?: "email" | "playwright";
  status: string;
  url?: string;
  screenshot_path?: string | null;
  applied_at: string;
  cover_letter?: string;
  notes?: string;
  gmail_message_id?: string;
}

export interface AppNotification {
  id: number;
  application_id?: number | null;
  title: string;
  message: string;
  type: "success" | "error" | "info";
  apply_method?: "email" | "playwright" | null;
  job_url?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Project {
  name?: string;
  title?: string;
  description?: string;
  technologies?: string[];
}

export interface ProfileData {
  full_name?: string;
  phone?: string;
  summary: string;
  skills: string[];
  experience: { title: string; company: string; duration?: string; description?: string }[];
  education: { degree: string; institution: string; year?: string }[];
  projects: Project[];
  ats_score?: number | null;
  formatting_score?: number;
  keyword_density_score?: number;
  action_verbs_score?: number;
  section_completeness_score?: number;
  ats_suggestions?: {
    missing_skills?: string[];
    formatting_suggestions?: string[];
    experience_improvements?: string[];
  };
}

export interface WorkspaceSettings {
  llm_provider: string;
  llm_model: string;
  custom_api_base: string;
  openai_api_key: string;
  google_client_id: string;
  google_client_secret: string;
  is_gmail_connected: boolean;
  gmail_email_address: string;
  enabled_connectors: string[];
  greenhouse_companies: string[];
  serpapi_api_key: string;
  job_details: string;
  target_roles: string[];
  target_countries: string[];
  work_mode_preference: string;
  salary_preference: string;
  experience_level: string;
  visa_sponsorship_str: string;
  daily_apply_limit: number;
  email: string;
  full_name: string;
  phone: string;
  portfolio_url: string;
  github_url: string;
  other_url: string;
}
