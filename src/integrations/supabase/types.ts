export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          description: string | null
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          status: string
          subject: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          status?: string
          subject?: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          status?: string
          subject?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      activity_comments: {
        Row: {
          activity_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          activity_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_image_usage: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      assignment_submissions: {
        Row: {
          assignment_id: string
          content: string | null
          created_at: string
          feedback: string | null
          file_url: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          student_id: string
        }
        Insert: {
          assignment_id: string
          content?: string | null
          created_at?: string
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          student_id: string
        }
        Update: {
          assignment_id?: string
          content?: string | null
          created_at?: string
          feedback?: string | null
          file_url?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          subject: string
          teacher_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          subject?: string
          teacher_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          subject?: string
          teacher_id?: string
          title?: string
        }
        Relationships: []
      }
      badges: {
        Row: {
          audience: string
          color: string
          description: string | null
          icon: string
          id: string
          name: string
        }
        Insert: {
          audience?: string
          color?: string
          description?: string | null
          icon?: string
          id: string
          name: string
        }
        Update: {
          audience?: string
          color?: string
          description?: string | null
          icon?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          bg: string | null
          body: string | null
          created_at: string
          id: string
          image_url: string | null
          student_id: string
          teacher_id: string
          title: string
        }
        Insert: {
          bg?: string | null
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          student_id: string
          teacher_id: string
          title: string
        }
        Update: {
          bg?: string | null
          body?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          student_id?: string
          teacher_id?: string
          title?: string
        }
        Relationships: []
      }
      competition_comments: {
        Row: {
          competition_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          competition_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          competition_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      competition_secrets: {
        Row: {
          competition_id: string
          correct_answer: string | null
          correct_index: number | null
          created_at: string
        }
        Insert: {
          competition_id: string
          correct_answer?: string | null
          correct_index?: number | null
          created_at?: string
        }
        Update: {
          competition_id?: string
          correct_answer?: string | null
          correct_index?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_secrets_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: true
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_submissions: {
        Row: {
          answer: string | null
          answers: Json | null
          approved_by: string | null
          competition_id: string
          correct_count: number | null
          id: string
          image_url: string | null
          is_correct: boolean
          link_url: string | null
          question_count: number | null
          submitted_at: string
          teacher_approved: boolean
          time_taken_seconds: number
          user_id: string
        }
        Insert: {
          answer?: string | null
          answers?: Json | null
          approved_by?: string | null
          competition_id: string
          correct_count?: number | null
          id?: string
          image_url?: string | null
          is_correct?: boolean
          link_url?: string | null
          question_count?: number | null
          submitted_at?: string
          teacher_approved?: boolean
          time_taken_seconds: number
          user_id: string
        }
        Update: {
          answer?: string | null
          answers?: Json | null
          approved_by?: string | null
          competition_id?: string
          correct_count?: number | null
          id?: string
          image_url?: string | null
          is_correct?: boolean
          link_url?: string | null
          question_count?: number | null
          submitted_at?: string
          teacher_approved?: boolean
          time_taken_seconds?: number
          user_id?: string
        }
        Relationships: []
      }
      competitions: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          duration_seconds: number
          ends_at: string
          id: string
          image_url: string | null
          is_multiple_choice: boolean
          options: Json | null
          question: string
          questions: Json | null
          starts_at: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          duration_seconds?: number
          ends_at: string
          id?: string
          image_url?: string | null
          is_multiple_choice?: boolean
          options?: Json | null
          question: string
          questions?: Json | null
          starts_at?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          duration_seconds?: number
          ends_at?: string
          id?: string
          image_url?: string | null
          is_multiple_choice?: boolean
          options?: Json | null
          question?: string
          questions?: Json | null
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          ends_at: string | null
          id: string
          starts_at: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          ends_at?: string | null
          id?: string
          starts_at: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          starts_at?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      gallery_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          item_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          item_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: []
      }
      gallery_contest_entries: {
        Row: {
          caption: string | null
          contest_id: string
          created_at: string
          id: string
          media_url: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          contest_id: string
          created_at?: string
          id?: string
          media_url?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          contest_id?: string
          created_at?: string
          id?: string
          media_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_contest_entries_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "gallery_contests"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_contest_votes: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_contest_votes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "gallery_contest_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_contests: {
        Row: {
          category: string
          cover_url: string | null
          created_at: string
          created_by: string
          description: string | null
          ends_at: string | null
          id: string
          title: string
        }
        Insert: {
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_at?: string | null
          id?: string
          title: string
        }
        Update: {
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          category: string
          content: string | null
          created_at: string
          id: string
          image_url: string | null
          user_id: string
        }
        Insert: {
          category?: string
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          user_id: string
        }
        Update: {
          category?: string
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          class_code: string | null
          country: string | null
          created_at: string
          display_name: string | null
          gender: string | null
          id: string
          is_banned: boolean
          level: number
          points: number
          role_type: string | null
          school: string | null
          teacher_id: string | null
          theme: string
          warning_count: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          class_code?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          gender?: string | null
          id: string
          is_banned?: boolean
          level?: number
          points?: number
          role_type?: string | null
          school?: string | null
          teacher_id?: string | null
          theme?: string
          warning_count?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          class_code?: string | null
          country?: string | null
          created_at?: string
          display_name?: string | null
          gender?: string | null
          id?: string
          is_banned?: boolean
          level?: number
          points?: number
          role_type?: string | null
          school?: string | null
          teacher_id?: string | null
          theme?: string
          warning_count?: number
        }
        Relationships: []
      }
      profiles_private: {
        Row: {
          grade: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          grade?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          grade?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          quiz_id: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          quiz_id: string
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          quiz_id?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          created_at: string
          created_by: string
          id: string
          questions: Json
          subject: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          questions?: Json
          subject?: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          questions?: Json
          subject?: string
          title?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          target_id: string
          target_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          content: string | null
          created_at: string
          id: string
          reason: string
          reported_user_id: string | null
          status: string
          target_id: string | null
          target_kind: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          reason: string
          reported_user_id?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          reason?: string
          reported_user_id?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string | null
          user_id?: string
        }
        Relationships: []
      }
      role_claim_codes: {
        Row: {
          code_hash: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          code_hash: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          code_hash?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_by: string | null
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_by?: string | null
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_by?: string | null
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_top: {
        Row: {
          created_at: string
          id: string
          points: number
          role_type: string
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          points?: number
          role_type?: string
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          points?: number
          role_type?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string | null
          display_name: string | null
          gender: string | null
          id: string | null
          points: number | null
          role_type: string | null
          school: string | null
          theme: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string | null
          display_name?: string | null
          gender?: string | null
          id?: string | null
          points?: number | null
          role_type?: string | null
          school?: string | null
          theme?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string | null
          display_name?: string | null
          gender?: string | null
          id?: string | null
          points?: number | null
          role_type?: string | null
          school?: string | null
          theme?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _emit_notification: {
        Args: {
          _body: string
          _link?: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: undefined
      }
      add_student_by_email: { Args: { _email: string }; Returns: boolean }
      award_weekly_top: { Args: never; Returns: Json }
      claim_admin_role: { Args: { _code: string }; Returns: boolean }
      claim_supervisor_role: { Args: { _code: string }; Returns: boolean }
      claim_teacher_role: { Args: { _code: string }; Returns: boolean }
      generate_class_code: { Args: never; Returns: string }
      get_competition_for_attempt: {
        Args: { _id: string }
        Returns: {
          created_by: string
          description: string
          ends_at: string
          id: string
          image_url: string
          questions: Json
          starts_at: string
          title: string
        }[]
      }
      get_quiz_for_attempt: {
        Args: { _quiz_id: string }
        Returns: {
          created_by: string
          id: string
          questions: Json
          subject: string
          title: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_banned: { Args: { _user_id: string }; Returns: boolean }
      is_blocked: { Args: { _a: string; _b: string }; Returns: boolean }
      is_teacher: { Args: { _user_id: string }; Returns: boolean }
      join_teacher_by_code: { Args: { _code: string }; Returns: boolean }
      list_quizzes: {
        Args: never
        Returns: {
          created_at: string
          created_by: string
          id: string
          question_count: number
          subject: string
          title: string
        }[]
      }
      list_supervisors: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          role: string
        }[]
      }
      safe_award_badge: {
        Args: { _awarded_by?: string; _badge_id: string; _user_id: string }
        Returns: undefined
      }
      set_role_claim_code: {
        Args: {
          _new_code: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      submit_competition_attempt: {
        Args: {
          _answers: Json
          _competition_id: string
          _time_taken_seconds: number
        }
        Returns: {
          correct_count: number
          question_count: number
        }[]
      }
      submit_quiz_attempt: {
        Args: { _answers?: Json; _essays?: Json; _quiz_id: string }
        Returns: {
          details: Json
          score: number
          total: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "teacher" | "supervisor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user", "teacher", "supervisor"],
    },
  },
} as const
