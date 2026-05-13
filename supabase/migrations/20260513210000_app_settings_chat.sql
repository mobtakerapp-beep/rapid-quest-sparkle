-- جدول إعدادات التطبيق (مفتاح/قيمة)
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

-- قيمة افتراضية: الشات مفتوح بناءً على الوقت (auto)
INSERT INTO app_settings (key, value)
VALUES ('chat_mode', 'auto')
ON CONFLICT (key) DO NOTHING;

-- صلاحية القراءة للجميع
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read settings"
  ON app_settings FOR SELECT
  USING (true);

-- صلاحية التعديل للمشرف/الأدمن فقط (نتحقق عبر user_roles)
CREATE POLICY "admins can update settings"
  ON app_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'supervisor', 'teacher')
    )
  );
