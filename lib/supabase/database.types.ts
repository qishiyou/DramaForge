export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Relationships: []
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          title: string
          genre: string
          visual_style: string
          storyline: string
          total_episodes: number
          episode_min_minutes: number
          episode_max_minutes: number
          script_file_path: string | null
          script_file_name: string | null
          script_file_mime_type: string | null
          script_file_size: number | null
          status: string
          created_at: string
          updated_at: string
        }
        Relationships: []
        Insert: {
          id?: string
          user_id: string
          title: string
          genre: string
          visual_style: string
          storyline: string
          total_episodes: number
          episode_min_minutes?: number
          episode_max_minutes?: number
          script_file_path?: string | null
          script_file_name?: string | null
          script_file_mime_type?: string | null
          script_file_size?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          genre?: string
          visual_style?: string
          storyline?: string
          total_episodes?: number
          episode_min_minutes?: number
          episode_max_minutes?: number
          script_file_path?: string | null
          script_file_name?: string | null
          script_file_mime_type?: string | null
          script_file_size?: number | null
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      characters: {
        Row: {
          id: string
          project_id: string
          name: string
          age: string
          height: string
          personality: string
          appearance: string
          appearance_detail: string | null
          role: string
          created_at: string
        }
        Relationships: []
        Insert: {
          id?: string
          project_id: string
          name: string
          age: string
          height: string
          personality: string
          appearance: string
          appearance_detail?: string | null
          role: string
          created_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          name?: string
          age?: string
          height?: string
          personality?: string
          appearance?: string
          appearance_detail?: string | null
          role?: string
          created_at?: string
        }
      }
      episodes: {
        Row: {
          id: string
          project_id: string
          episode_number: number
          title: string
          synopsis: string
          status: string
          created_at: string
          updated_at: string
        }
        Relationships: []
        Insert: {
          id?: string
          project_id: string
          episode_number: number
          title: string
          synopsis?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          episode_number?: number
          title?: string
          synopsis?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      storyboard_entries: {
        Row: {
          id: string
          episode_id: string
          scene_number: number
          scene_description: string
          camera_movement: string
          dialogue: string
          character_in_scene: string
          visual_elements: string
          duration: string
          mood: string
          voice_over: string
          color_tone: string
          ai_video_prompt: string
          created_at: string
          updated_at: string
        }
        Relationships: []
        Insert: {
          id?: string
          episode_id: string
          scene_number: number
          scene_description: string
          camera_movement: string
          dialogue: string
          character_in_scene: string
          visual_elements: string
          duration: string
          mood: string
          voice_over?: string
          color_tone?: string
          ai_video_prompt?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          episode_id?: string
          scene_number?: number
          scene_description?: string
          camera_movement?: string
          dialogue?: string
          character_in_scene?: string
          visual_elements?: string
          duration?: string
          mood?: string
          voice_over?: string
          color_tone?: string
          ai_video_prompt?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
