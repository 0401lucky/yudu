-- 书架单层分组：NULL = 未分组；空分组无实体表，随最后一本书移出自然消失
ALTER TABLE books ADD COLUMN group_name TEXT;
