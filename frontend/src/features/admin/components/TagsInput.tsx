import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Comma-separated tags.
 *
 * Keeps the raw text while the field has focus and only parses on blur. The
 * obvious version — deriving the input's value from `tags.join(', ')` and
 * re-parsing on every keystroke — cannot accept a second tag at all: typing the
 * comma after "linen" produces `['linen', '']`, the empty entry is filtered
 * out, and the field re-renders as "linen" with the separator the user just
 * typed erased. There is then no way to reach a second tag.
 */
export function TagsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState(() => value.join(', '));
  const [isEditing, setIsEditing] = useState(false);

  // Follow the form while the user is not typing — the field is filled from a
  // loaded product, and reset when the form is.
  useEffect(() => {
    if (!isEditing) setDraft(value.join(', '));
  }, [value, isEditing]);

  const commit = () => {
    setIsEditing(false);
    onChange(
      draft
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    );
  };

  return (
    <Input
      id="tags"
      value={draft}
      onFocus={() => setIsEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
      }}
      placeholder="linen, summer, breathable"
    />
  );
}
