-- Fictional sample data, exclusively for the isolated browser development database.
BEGIN;
SELECT pg_advisory_xact_lock(74692411);
DO $$
BEGIN
  IF current_database() <> 'hikari_dev' THEN
    RAISE EXCEPTION 'Demo seed is allowed only in hikari_dev';
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS miniapp_dev_seed(version INTEGER PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
DO $$
DECLARE tbl TEXT;
BEGIN
  IF EXISTS(SELECT 1 FROM miniapp_dev_seed WHERE version=1) THEN RETURN; END IF;

  INSERT INTO people(id,full_name,is_russian_citizen,is_itmo_student) OVERRIDING SYSTEM VALUE
  SELECT 1000+n,
    (ARRAY['Анна','Михаил','София','Александр','Мария','Артём','Полина','Даниил','Екатерина','Илья','Алиса','Никита'])[1+(n-1)%12] || ' ' ||
    (ARRAY['Соколова','Морозов','Лебедева','Волков','Орлова','Смирнов','Кузнецова','Петров','Новикова','Козлов','Васильева','Попов'])[1+(n-1)%12],
    CASE WHEN n%7=0 THEN NULL ELSE n%5<>0 END,
    CASE WHEN n%9=0 THEN NULL ELSE n%3=0 END
  FROM generate_series(1,28) AS n;

  INSERT INTO telegram_identities(person_id,telegram_user_id,username,display_name,last_seen_at)
  SELECT id,900000000+id,'demo_member_'||(id-1000),split_part(full_name,' ',1),NOW()-(id%7)*INTERVAL '1 day' FROM people WHERE id BETWEEN 1001 AND 1028;

  INSERT INTO events(id,title,starts_at,ends_at,status) OVERRIDING SYSTEM VALUE
  SELECT 1000+n,(ARRAY['Первое знакомство с японским','Город, в котором хочется жить','Кино и разговоры после','Маленькие радости осени','Путешествие по Кансай','Настольные игры на японском','Разговорный клуб: любимые места','Встреча о японском кино'])[n],
    date_trunc('day',NOW())+(n-6)*INTERVAL '7 days'+INTERVAL '15 hours',
    date_trunc('day',NOW())+(n-6)*INTERVAL '7 days'+INTERVAL '17 hours',
    CASE WHEN n<=6 THEN 'completed' ELSE 'active' END
  FROM generate_series(1,8) AS n;

  INSERT INTO publications(id,creator_telegram_id,text,status,source,source_key,scheduled_at,completed_at)
  SELECT id,123456789,title||E'\n\nВстречаемся в клубе Hikari: будем говорить по-японски, знакомиться и обмениваться историями. Приходите с любым уровнем — вместе интереснее.\n\nЭто демонстрационная запись локального стенда.',
    CASE WHEN id=1008 THEN 'draft' ELSE 'sent' END,'miniapp','local-demo-'||id,
    CASE WHEN id=1008 THEN NULL ELSE starts_at-INTERVAL '3 days' END,
    CASE WHEN id=1008 THEN NULL ELSE starts_at-INTERVAL '3 days' END
  FROM events WHERE id BETWEEN 1001 AND 1008;

  INSERT INTO publication_deliveries(publication_id,target_key,target_name,destination,status,published_at)
  SELECT id,'local-club','Канал клуба · демо, без отправки','-1000000000001',CASE WHEN status='draft' THEN 'pending' ELSE 'sent' END,completed_at
  FROM publications WHERE id BETWEEN 1001 AND 1008;

  INSERT INTO event_publication_references(event_id,provider,external_publication_id,published)
  SELECT id,'hikari_publishing',id::text,id<>1008 FROM events WHERE id BETWEEN 1001 AND 1008;

  INSERT INTO event_registrations(event_id,person_id,registered_at)
  SELECT e.id,p.id,e.starts_at-INTERVAL '2 days' FROM events e CROSS JOIN people p
  WHERE e.id BETWEEN 1001 AND 1007 AND p.id BETWEEN 1001 AND 1028 AND (e.id+p.id)%3<>0;

  INSERT INTO attendance(registration_id,attended,recorded_at)
  SELECT r.id,r.person_id%5<>0,e.ends_at+INTERVAL '1 hour'
  FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE e.id BETWEEN 1001 AND 1006;

  INSERT INTO feedback(id,person_id,event_id,text,created_at) OVERRIDING SYSTEM VALUE
  SELECT 1000+n,1000+n,CASE WHEN n%4=0 THEN NULL ELSE 1001+(n%6) END,
    (ARRAY['Очень уютная встреча! Было легко включиться в разговор, даже когда не хватало слов. Спасибо за помощь и терпение.',
    'Хочется больше разговоров в маленьких группах: так каждый успевает рассказать свою историю.',
    'Понравились темы и атмосфера. Было бы здорово в следующий раз обсудить путешествия по небольшим городам.',
    'Спасибо клубу за встречи. Хорошо, что можно прийти с разным уровнем языка и чувствовать себя на своём месте.'])[1+(n-1)%4],
    NOW()-(19-n)*INTERVAL '1 day'
  FROM generate_series(1,18) AS n;

  INSERT INTO ai_topic_jobs(id,scheduled_for,status,attempts,next_attempt_at,prompt_version,topic,publication_id)
  SELECT 1000+n,NOW()-(10-n)*INTERVAL '1 day','scheduled',1,NOW(),'demo',
    jsonb_build_object('jlpt_level','N3','title',(ARRAY['週末の楽しみ — выходные','好きな街 — любимый город','旅の思い出 — воспоминания о поездках'])[n],
      'introduction','Демонстрационный материал для просмотра истории. Генератор на локальном стенде не подключён.',
      'questions',jsonb_build_array('週末は何をするのが好きですか。','友達とどこに行きたいですか。'),
      'vocabulary',jsonb_build_array(jsonb_build_object('japanese','週末','reading','しゅうまつ','translation','выходные')),
      'grammar',jsonb_build_array(jsonb_build_object('pattern','〜たい','explanation','Желание сделать что-либо','example','京都に行きたいです。','translation','Хочу поехать в Киото.'))),
    1000+n
  FROM generate_series(1,3) AS n;

  FOREACH tbl IN ARRAY ARRAY['people','events','publications','feedback','ai_topic_jobs'] LOOP
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L,''id''),(SELECT MAX(id) FROM %I),true)',tbl,tbl);
  END LOOP;
  INSERT INTO miniapp_dev_seed(version) VALUES(1);
END $$;
-- A new, read-only preview sample, added once without touching existing drafts.
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM miniapp_dev_seed WHERE version=2) THEN RETURN; END IF;
 INSERT INTO publications(creator_telegram_id,text,entities,rich_message,source,source_key)
 VALUES(123456789,'光 · Вечер японского кино. Обсудим любимые фильмы и познакомимся.','[]',
 '{"blocks":[{"type":"heading","size":2,"text":"光 · Вечер японского кино"},{"type":"paragraph","text":["Посмотрим фрагменты и обсудим ",{"type":"bold","text":"любимые фильмы"},". Можно прийти с любым уровнем японского."]},{"type":"list","items":[{"blocks":[{"type":"paragraph","text":"Знакомство и небольшой разогрев"}]},{"blocks":[{"type":"paragraph","text":"Обсуждение в маленьких группах"}]}]},{"type":"divider"},{"type":"footer","text":"Демонстрационный черновик из бота. Настройте встречу и публикацию справа."}]}',
 'admin','local-rich-preview-v2') ON CONFLICT(source_key) DO NOTHING;
 INSERT INTO miniapp_dev_seed(version) VALUES(2);
END $$;
COMMIT;
