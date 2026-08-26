/**
 * GENERATED FILE — do not hand-edit once a database exists.
 *
 *   supabase gen types typescript --local \
 *     --schema app --schema catalog --schema recipe --schema social \
 *     > src/types/database.ts
 *
 * This copy was written by hand from schema.md so the frontend could be built
 * before the migrations exist. It is deliberately narrow: it covers the tables,
 * views and functions the client actually touches. The `ai` schema is absent on
 * purpose — it is never exposed to PostgREST.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamptz = string;

export type Database = {
  app: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          locale: string;
          is_active: boolean;
          created_at: Timestamptz;
          updated_at: Timestamptz;
          deleted_at: Timestamptz | null;
        };
        Insert: {
          id: string;
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          locale?: string;
        };
        Update: {
          username?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          locale?: string;
        };
        Relationships: [];
      };
      roles: {
        Row: { role_id: number; code: string; display_name: string };
        Insert: { role_id: number; code: string; display_name: string };
        Update: { code?: string; display_name?: string };
        Relationships: [];
      };
      user_roles: {
        Row: { user_id: string; role_id: number };
        Insert: { user_id: string; role_id: number };
        Update: { role_id?: number };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      has_role: { Args: { check_code: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };

  catalog: {
    Tables: {
      units: {
        Row: {
          unit_id: number;
          code: string;
          name: string | null;
          dimension: 'mass' | 'volume' | 'count';
          to_base_factor: number | null;
          system: 'metric' | 'imperial' | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ingredients: {
        Row: {
          ingredient_id: number;
          slug: string;
          name: string;
          category_id: number | null;
          default_unit_id: number | null;
          kcal_per_100: number | null;
          protein_per_100: number | null;
          carbs_per_100: number | null;
          fat_per_100: number | null;
          avg_cost_per_100: number | null;
          is_verified: boolean;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ingredient_aliases: {
        Row: { alias_id: number; ingredient_id: number; alias: string; locale: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ingredient_allergens: {
        Row: { ingredient_id: number; allergen_id: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      ingredient_categories: {
        Row: { category_id: number; slug: string; name: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cuisines: {
        Row: {
          cuisine_id: number;
          slug: string;
          name: string;
          region: string | null;
          icon: string | null;
          is_active: boolean;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      diets: {
        Row: {
          diet_id: number;
          slug: string;
          name: string;
          description: string | null;
          is_active: boolean;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      allergens: {
        Row: { allergen_id: number; slug: string; name: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      meal_types: {
        Row: { meal_type_id: number; slug: string; name: string; sort_order: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      equipment: {
        Row: { equipment_id: number; slug: string; name: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      tags: {
        Row: { tag_id: number; slug: string; name: string; usage_count: number };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };

  recipe: {
    Tables: {
      recipes: {
        Row: {
          recipe_id: string;
          author_id: string | null;
          title: string;
          slug: string;
          summary: string | null;
          servings: number;
          prep_minutes: number | null;
          cook_minutes: number | null;
          total_minutes: number;
          difficulty: number | null;
          est_cost: number | null;
          currency: string;
          cover_image_url: string | null;
          source_type: 'ai' | 'user' | 'imported';
          source_url: string | null;
          status: 'draft' | 'published' | 'archived';
          visibility: 'private' | 'unlisted' | 'public';
          language: string | null;
          rating_avg: number | null;
          rating_count: number;
          save_count: number;
          view_count: number;
          published_at: Timestamptz | null;
          created_at: Timestamptz;
          updated_at: Timestamptz;
          deleted_at: Timestamptz | null;
        };
        Insert: {
          recipe_id?: string;
          author_id?: string | null;
          title: string;
          slug: string;
          summary?: string | null;
          servings: number;
          prep_minutes?: number | null;
          cook_minutes?: number | null;
          difficulty?: number | null;
          est_cost?: number | null;
          currency?: string;
          cover_image_url?: string | null;
          source_type?: 'ai' | 'user' | 'imported';
          source_url?: string | null;
          status?: 'draft' | 'published' | 'archived';
          visibility?: 'private' | 'unlisted' | 'public';
          language?: string | null;
        };
        Update: {
          title?: string;
          slug?: string;
          summary?: string | null;
          servings?: number;
          prep_minutes?: number | null;
          cook_minutes?: number | null;
          difficulty?: number | null;
          est_cost?: number | null;
          cover_image_url?: string | null;
          status?: 'draft' | 'published' | 'archived';
          visibility?: 'private' | 'unlisted' | 'public';
          published_at?: Timestamptz | null;
          deleted_at?: Timestamptz | null;
        };
        Relationships: [];
      };
      recipe_ingredients: {
        Row: {
          recipe_ingredient_id: number;
          recipe_id: string;
          ingredient_id: number | null;
          raw_text: string;
          quantity: number | null;
          unit_id: number | null;
          preparation: string | null;
          is_optional: boolean;
          group_label: string | null;
          sort_order: number;
        };
        Insert: {
          recipe_id: string;
          ingredient_id?: number | null;
          raw_text: string;
          quantity?: number | null;
          unit_id?: number | null;
          preparation?: string | null;
          is_optional?: boolean;
          group_label?: string | null;
          sort_order?: number;
        };
        Update: {
          ingredient_id?: number | null;
          raw_text?: string;
          quantity?: number | null;
          unit_id?: number | null;
          preparation?: string | null;
          is_optional?: boolean;
          group_label?: string | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      recipe_steps: {
        Row: {
          step_id: number;
          recipe_id: string;
          step_number: number;
          instruction: string;
          duration_minutes: number | null;
          image_url: string | null;
        };
        Insert: {
          recipe_id: string;
          step_number: number;
          instruction: string;
          duration_minutes?: number | null;
          image_url?: string | null;
        };
        Update: {
          step_number?: number;
          instruction?: string;
          duration_minutes?: number | null;
          image_url?: string | null;
        };
        Relationships: [];
      };
      recipe_nutrition: {
        Row: {
          recipe_id: string;
          calories: number | null;
          protein_g: number | null;
          carbs_g: number | null;
          fat_g: number | null;
          fiber_g: number | null;
          sugar_g: number | null;
          sodium_mg: number | null;
          is_estimated: boolean;
          calculated_at: Timestamptz | null;
        };
        Insert: {
          recipe_id: string;
          calories?: number | null;
          protein_g?: number | null;
          carbs_g?: number | null;
          fat_g?: number | null;
          fiber_g?: number | null;
          sugar_g?: number | null;
          sodium_mg?: number | null;
          is_estimated?: boolean;
        };
        Update: {
          calories?: number | null;
          protein_g?: number | null;
          carbs_g?: number | null;
          fat_g?: number | null;
          is_estimated?: boolean;
        };
        Relationships: [];
      };
      recipe_images: {
        Row: {
          image_id: number;
          recipe_id: string;
          url: string;
          alt_text: string | null;
          aspect: string | null;
          sort_order: number;
        };
        Insert: {
          recipe_id: string;
          url: string;
          alt_text?: string | null;
          aspect?: string | null;
          sort_order?: number;
        };
        Update: { url?: string; alt_text?: string | null; sort_order?: number };
        Relationships: [];
      };
      recipe_cuisines: {
        Row: { recipe_id: string; cuisine_id: number };
        Insert: { recipe_id: string; cuisine_id: number };
        Update: { cuisine_id?: number };
        Relationships: [];
      };
      recipe_diets: {
        Row: { recipe_id: string; diet_id: number };
        Insert: { recipe_id: string; diet_id: number };
        Update: { diet_id?: number };
        Relationships: [];
      };
      recipe_tags: {
        Row: { recipe_id: string; tag_id: number };
        Insert: { recipe_id: string; tag_id: number };
        Update: { tag_id?: number };
        Relationships: [];
      };
      recipe_meal_types: {
        Row: { recipe_id: string; meal_type_id: number };
        Insert: { recipe_id: string; meal_type_id: number };
        Update: { meal_type_id?: number };
        Relationships: [];
      };
      recipe_equipment: {
        Row: { recipe_id: string; equipment_id: number };
        Insert: { recipe_id: string; equipment_id: number };
        Update: { equipment_id?: number };
        Relationships: [];
      };
    };
    Views: {
      vw_recipe_cards: {
        Row: {
          recipe_id: string;
          slug: string;
          title: string;
          summary: string | null;
          cover_image_url: string | null;
          servings: number;
          total_minutes: number;
          difficulty: number | null;
          est_cost: number | null;
          currency: string;
          status: string;
          visibility: string;
          rating_avg: number | null;
          rating_count: number;
          save_count: number;
          published_at: Timestamptz | null;
          author_id: string | null;
          author_username: string | null;
          author_display_name: string | null;
          author_avatar_url: string | null;
          calories: number | null;
          cuisines: string | null;
          diets: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      search_recipes: {
        Args: {
          p_include_ingredients?: number[];
          p_exclude_ingredients?: number[];
          p_cuisines?: number[];
          p_diets?: number[];
          p_meal_types?: number[];
          p_exclude_allergens?: number[];
          p_equipment?: number[];
          p_max_minutes?: number;
          p_max_cost?: number;
          p_cost_per_serving?: boolean;
          p_max_calories?: number;
          p_max_difficulty?: number;
          p_min_servings?: number;
          p_max_servings?: number;
          p_min_rating?: number;
          p_search?: string;
          p_sort?: string;
          p_limit?: number;
          p_offset?: number;
          p_author_id?: string;
        };
        Returns: Database['recipe']['Views']['vw_recipe_cards']['Row'][];
      };
      count_recipes: {
        Args: {
          p_include_ingredients?: number[];
          p_exclude_ingredients?: number[];
          p_cuisines?: number[];
          p_diets?: number[];
          p_max_minutes?: number;
        };
        Returns: number;
      };
      /**
       * The client's only window into the `ai` schema, which is never exposed to
       * PostgREST. security definer, scoped to rows owned by auth.uid().
       */
      get_generation_status: {
        Args: { p_request_id: string };
        Returns: {
          request_id: string;
          status: 'pending' | 'success' | 'failed' | 'filtered';
          recipe_id: string | null;
          recipe_slug: string | null;
          error_message: string | null;
          created_at: Timestamptz;
          completed_at: Timestamptz | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };

  social: {
    Tables: {
      ratings: {
        Row: { user_id: string; recipe_id: string; rating: number; created_at: Timestamptz };
        Insert: { recipe_id: string; rating: number; user_id?: string };
        Update: { rating: number };
        Relationships: [];
      };
      comments: {
        Row: {
          comment_id: number;
          recipe_id: string;
          user_id: string;
          parent_id: number | null;
          body: string;
          created_at: Timestamptz;
          updated_at: Timestamptz;
          deleted_at: Timestamptz | null;
        };
        Insert: { recipe_id: string; body: string; parent_id?: number | null; user_id?: string };
        Update: { body?: string; deleted_at?: Timestamptz | null };
        Relationships: [];
      };
      saved_recipes: {
        Row: { user_id: string; recipe_id: string; saved_at: Timestamptz; notes: string | null };
        Insert: { recipe_id: string; user_id?: string; notes?: string | null };
        Update: { notes?: string | null };
        Relationships: [];
      };
      collections: {
        Row: {
          collection_id: string;
          user_id: string;
          name: string;
          description: string | null;
          cover_image_url: string | null;
          is_public: boolean;
          created_at: Timestamptz;
          deleted_at: Timestamptz | null;
        };
        Insert: {
          name: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_public?: boolean;
          user_id?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          cover_image_url?: string | null;
          is_public?: boolean;
          deleted_at?: Timestamptz | null;
        };
        Relationships: [];
      };
      collection_recipes: {
        Row: {
          collection_id: string;
          recipe_id: string;
          sort_order: number;
          added_at: Timestamptz;
        };
        Insert: { collection_id: string; recipe_id: string; sort_order?: number };
        Update: { sort_order?: number };
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; followee_id: string; created_at: Timestamptz };
        Insert: { followee_id: string; follower_id?: string };
        Update: { followee_id?: string };
        Relationships: [];
      };
      user_diet_preferences: {
        Row: { user_id: string; diet_id: number };
        Insert: { diet_id: number; user_id?: string };
        Update: { diet_id?: number };
        Relationships: [];
      };
      user_allergen_preferences: {
        Row: { user_id: string; allergen_id: number };
        Insert: { allergen_id: number; user_id?: string };
        Update: { allergen_id?: number };
        Relationships: [];
      };
      reports: {
        Row: {
          report_id: number;
          reporter_id: string | null;
          target_type: 'recipe' | 'comment' | 'user';
          target_id: string;
          reason: string;
          details: string | null;
          status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
          resolved_by: string | null;
          resolved_at: Timestamptz | null;
          created_at: Timestamptz;
        };
        Insert: {
          target_type: 'recipe' | 'comment' | 'user';
          target_id: string;
          reason: string;
          details?: string | null;
          reporter_id?: string;
        };
        Update: {
          status?: 'open' | 'reviewing' | 'resolved' | 'dismissed';
          resolved_by?: string | null;
          resolved_at?: Timestamptz | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<
  S extends keyof Database,
  T extends keyof Database[S]['Tables'],
> = Database[S]['Tables'][T] extends { Row: infer R } ? R : never;
