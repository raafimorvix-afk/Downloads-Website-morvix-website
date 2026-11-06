import re, sys, colorsys, collections, openpyxl

def theme_palette(wb):
    xml = wb.loaded_theme.decode() if isinstance(wb.loaded_theme, bytes) else wb.loaded_theme
    order = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']
    pal = []
    for name in order:
        m = re.search(rf'<a:{name}>(.*?)</a:{name}>', xml, re.S)
        c = re.search(r'(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"', m.group(1)) if m else None
        pal.append(c.group(1).upper() if c else 'FFFFFF')
    return pal

def cell_rgb(cell, pal):
    f = cell.fill
    if not f or not f.fill_type: return None
    c = f.fgColor
    if c.type == 'rgb' and isinstance(c.rgb, str): return c.rgb[-6:].upper()
    if c.type == 'theme':
        base = pal[c.theme] if c.theme < len(pal) else 'FFFFFF'
        r, g, b = (int(base[i:i + 2], 16) / 255 for i in (0, 2, 4))
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        t = c.tint or 0
        l = l * (1 + t) if t < 0 else l * (1 - t) + t
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        return '%02X%02X%02X' % (round(r * 255), round(g * 255), round(b * 255))
    return None

def bucket(rgb):
    if not rgb: return 'none'
    r, g, b = (int(rgb[i:i + 2], 16) / 255 for i in (0, 2, 4))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    if s < 0.25 or l > 0.93: return 'none'          # white / light grey / near-white
    deg = h * 360
    if deg < 15 or deg >= 340: return 'red'
    if deg < 45: return 'orange'
    if deg < 70: return 'yellow'
    if deg < 165: return 'green'
    if deg < 200: return 'cyan'
    if deg < 260: return 'blue'
    return 'other'

if __name__ == '__main__':
    wb = openpyxl.load_workbook(sys.argv[1]); pal = theme_palette(wb)
    print('theme', pal)
    tot = collections.Counter(); raw = collections.Counter()
    for ws in wb:
        for row in ws.iter_rows(min_row=2):
            if not (row[1].value and row[3].value): continue
            rgb = cell_rgb(row[3], pal); raw[(rgb, bucket(rgb))] += 1; tot[bucket(rgb)] += 1
    print(dict(tot)); print(raw.most_common(25))
