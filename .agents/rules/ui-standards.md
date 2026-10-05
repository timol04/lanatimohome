# UI Standards: Delete / Trash Buttons

When adding or modifying delete buttons (Mülleimer/Löschbuttons) across the application, always follow this standard to ensure a consistent look and feel:

1. **CSS Class:** Always use the `item-delete` class. Do not create new classes like `note-delete` or use inline styles for the base appearance.
2. **Icon:** Always use the Lucide `trash-2` icon (`<i data-lucide="trash-2"></i>`). Do NOT use `x` or other variants.
3. **Positioning / Alignment:** 
   - Group the delete button closely with relevant metadata (like dates) using a flex container (e.g., `display: flex; align-items: center; gap: 4px;`).
   - Do NOT use `position: absolute` to force the button into a corner, as this breaks the standard spacing and padding.
   - Adjust margins minimally (e.g., `margin: 0; padding: 4px;`) if needed to align it correctly within a flex row.

## Example (Correct Implementation)

```html
<div style="display:flex; align-items:center; gap:4px;">
  <span style="font-size: 0.85em; color:var(--text-muted);">${date}</span>
  <button class="item-delete" onclick="deleteItem('${item.id}')" style="margin:0;">
    <i data-lucide="trash-2"></i>
  </button>
</div>
```
