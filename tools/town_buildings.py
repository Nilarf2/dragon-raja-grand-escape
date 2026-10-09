# The building types of the town (pure Python, uses town_lib). Each variant is built at 3 levels of detail:
#   0 near (< ~70 m): tile courses, ridge stacks, frames, mullions, gutters, balusters, laundry, AC grilles
#   1 mid  (< ~400 m): wavy kawara rows, ridges and onigawara, recessed windows, shutters boxes, balconies, laundry
#   2 far: walls with real window holes, flat roof planes with ridges
import math, random, zlib
from town_lib import (Mesh, Facade, Roof, RoofPlane, F, WALL, WALL2, ROOF, SASH, GLASS, WOOD, C_BASE, C_CONC, C_DARK,
                     C_GLASS, C_CURT, C_DOOR, C_WHITE, C_STEEL, LAUNDRY, ac_unit, laundry, antenna, solar_heater, gutters,
                     downpipe, railing, balcony, window_row, v_add, v_mul)


def rng(seed, tag): return random.Random(zlib.crc32(('%s/%s' % (seed, tag)).encode()))


def sides(w, d):
    """facade frames: name -> (origin, U, N, L) for the 4 walls of a w x d box centred at the origin"""
    return {
        'front': ((-w / 2, 0, d / 2), (1, 0, 0), (0, 0, 1), w),
        'right': ((w / 2, 0, d / 2), (0, 0, -1), (1, 0, 0), d),
        'back': ((w / 2, 0, -d / 2), (-1, 0, 0), (0, 0, -1), w),
        'left': ((-w / 2, 0, -d / 2), (0, 0, 1), (-1, 0, 0), d),
    }


class WinIds:
    def __init__(self): self.n = 0
    def next(self):
        self.n += 1
        return (self.n - 1) % 31 + 1


def house(spec, lod):
    """generic Japanese house / shop / apartment from a spec dict"""
    s = spec; seed = s['seed']
    M = Mesh(); W = WinIds()
    side_extra = s.get('side_extra', 0.0)     # apartment stair zone on the right, inside the footprint
    w, d, fl = s['w'] - side_extra, s['d'], s['floors']
    fh = s.get('fh', 2.75); base = 0.42
    H = base + fl * fh - 0.15
    ink = 0.035 if lod == 0 else (0.07 if lod == 1 else 0.0)
    R = rng(seed, 'layout')
    wall_style = s.get('wall', 'mortar')
    front_extra = s.get('front_extra', 0.0)   # e.g. apartment corridor depth inside the footprint
    dw = d - front_extra                      # wall depth
    zc = -front_extra / 2                     # wall box centre z
    M.push((-side_extra / 2, 0, zc))
    walls = sides(w, dw)
    curt = lambda: C_CURT[R.randrange(len(C_CURT))] if R.random() < 0.6 else None
    sash = F(0.8)
    shop = s.get('shop')
    # ---- openings per facade
    ops = {k: [] for k in walls}
    def add(side, u0, u1, y0, y1, kind, **kw):
        o = dict(u0=u0, u1=u1, y0=y0, y1=y1, kind=kind, sash=sash, **kw)
        if kind not in ('door', 'shutter'): o['win'] = W.next(); o['curtain'] = kw.get('curtain', curt()); o['flip'] = R.random() < 0.5
        ops[side].append(o)
        return o
    for f in range(fl):
        y0 = base + f * fh
        for side, (O, U, N, L) in walls.items():
            if s.get('apartment') and side == 'front':
                continue
            if f == 0 and side == 'front' and shop:
                continue
            if side == 'front':
                kinds = (['tall', 'tall'] if (f == 1 and s.get('balcony')) else ['std', 'rand']) if f > 0 else (['std', 'rand'] if s.get('engawa') is None else ['tall', 'tall'])
            elif side == 'back':
                kinds = ['tall', 'std'] if (f > 0 and s.get('back_balcony')) else ['std', 'small', 'rand']
            else:
                kinds = ['std', 'small', 'rand'] if L > 5 else ['rand']
            if s.get('apartment') and side == 'back': kinds = ['tall']
            for (u0, u1, a, b, k) in window_row(L, y0, kinds, R, margin=0.5, spacing=s.get('spacing', 2.4) if side in ('front', 'back') else 2.6):
                if f == 0 and side == 'front' and u0 < 2.0 and not s.get('apartment'): continue   # entrance there
                o = add(side, u0, u1, a, b, k)
                if k == 'small' and f == 0: o['lattice'] = True
                if s.get('amado') and k in ('std', 'tall') and R.random() < 0.6: o['amado'] = 1 if u1 + (u1 - u0) * 0.5 < L - 0.2 else -1; o['amado_col'] = F(0.8); o['amado_part'] = WOOD if wall_style == 'wood' else SASH
    # entrance (not for shops/apartments)
    if not shop and not s.get('apartment'):
        add('front', 0.6, 1.5, base - 0.1, base + 2.0, 'door', col=C_DOOR[R.randrange(len(C_DOOR))], canopy=True)
    if shop:
        k = shop
        if k == 'shutter':
            add('front', 0.4, w - 0.4, 0.0, 2.6, 'shutter', open=R.choice([0.0, 1.2, 2.2]), depth=0.12)
        else:   # glazed shop front
            add('front', 0.5, w - 0.5, 0.15, 2.5, 'tall', depth=0.2, curtain=(0.85, 0.80, 0.62))
    if s.get('apartment'):
        units = s.get('units', 4)
        uw = w / units
        for f in range(fl):
            y0 = base + f * fh
            for i in range(units):
                add('front', i * uw + 0.4, i * uw + 1.3, y0 - 0.1 if f == 0 else y0, y0 + 2.0, 'door', col=C_DOOR[2 + (i % 2)])
                o = add('front', i * uw + 1.7, i * uw + 2.6, y0 + 1.0, y0 + 1.9, 'std'); o['lattice'] = True
    # ---- walls
    for side, (O, U, N, L) in walls.items():
        fa = Facade(M, O, U, N, L, H, lod)
        fa.bands.append((0.0, base, 0, C_BASE))
        if wall_style == 'two' and fl >= 2:
            fa.bands.append((base, base + fh, WALL2, F(0.82)))
            fa.bands.append((base + fh, H, WALL, F(0.82)))
        else:
            fa.bands.append((base, H, WALL, F(0.82)))
        fa.cuts |= {H - 0.5, H - 1.1, base + 0.5}
        fa.ops = ops[side]
        fa.build()
        if lod == 0 and wall_style in ('siding', 'wood'):   # siding joints / board edges
            step = 0.45 if wall_style == 'siding' else 0.3
            y = base + step
            while y < H - 0.1:
                blocked = [(o['u0'], o['u1']) for o in ops[side] if o['y0'] - 0.02 < y < o['y1'] + 0.08]
                us = [0.0]
                for a, b in sorted(blocked): us += [a - 0.06, b + 0.06]
                us.append(L)
                for i in range(0, len(us) - 1, 2):
                    if us[i + 1] - us[i] > 0.1: fa.box((us[i] + us[i + 1]) / 2, y, 0.008, us[i + 1] - us[i], 0.02, 0.016, F(0.7), WALL if wall_style == 'siding' else WOOD)
                y += step
        if lod <= 1 and wall_style == 'two' and fl >= 2:
            fa.box(L / 2, base + fh, 0.03, L, 0.12, 0.06, F(0.75), WOOD)   # floor belt between storeys
        if lod <= 1 and fl >= 2 and wall_style == 'wood':
            for u in (0.05, L - 0.05): fa.box(u, H / 2, 0.03, 0.1, H, 0.06, F(0.6), WOOD)
    if ink: M.ink_box(0, H / 2, 0, w, H, dw, ink)
    # ---- roof
    rk = s.get('roof', 'gable')
    if rk == 'flat':
        M.box(0, H + 0.05, 0, w, 0.1, dw, C_CONC, 0, skip='b')
        # parapet
        ph = 0.7
        for (cx, cz, sx, sz) in ((0, dw / 2 - 0.1, w, 0.2), (0, -dw / 2 + 0.1, w, 0.2), (w / 2 - 0.1, 0, 0.2, dw - 0.4), (-w / 2 + 0.1, 0, 0.2, dw - 0.4)):
            M.box(cx, H + ph / 2, cz, sx, ph, sz, F(0.86), WALL, skip='b')
            if lod <= 1: M.box(cx, H + ph + 0.03, cz, sx + 0.04, 0.06, sz + 0.04, F(0.7), SASH)
        if ink: M.ink_box(0, H / 2 + ph / 2, 0, w, H + ph, dw, ink)
        if lod <= 1:   # roof furniture: water tank, AC condensers, a stair hut
            Rr = rng(seed, 'rooftop')
            tx = Rr.uniform(-w / 2 + 1.5, w / 2 - 1.5)
            M.box(tx, H + 0.3, -dw / 4, 1.6, 0.5, 1.4, C_CONC, 0)
            M.tube((tx - 0.7, H + 1.05, -dw / 4), (tx + 0.7, H + 1.05, -dw / 4), 0.5, (0.85, 0.86, 0.84), 0, seg=8 if lod == 0 else 5, caps=True)
            if s.get('stair_hut'):
                hx = -tx * 0.6
                M.box(hx, H + 1.25, dw / 6, 2.4, 2.5, 3.0, F(0.84), WALL, skip='b')
                M.box(hx, H + 2.55, dw / 6, 2.7, 0.12, 3.3, C_CONC, 0)
                if ink: M.ink_box(hx, H + 1.3, dw / 6, 2.4, 2.6, 3.0, ink)
            for i in range(Rr.randint(1, 3)): ac_unit(M, Rr.uniform(-w / 2 + 1, w / 2 - 1), H + 0.1, Rr.uniform(0, dw / 2 - 1), Rr.choice([0, math.pi]), lod)
        roof = None
        top = H + ph
    else:
        pitch = s.get('pitch', 0.45 if rk != 'shed' else 0.12)
        roof = Roof(rk, w, dw, H, pitch=pitch, ov=s.get('ov', 0.6), og=s.get('og', 0.45), ridge_x=s.get('ridge_x'),
                    front_ov=s.get('front_ov'), back_ov=s.get('back_ov'))
        roof.build(M, lod, tile=s.get('tile', 'kawara' if rk != 'shed' else 'metal'), ink=ink)
        roof.gable_walls(M, F(0.82), WALL)
        top = roof.top
        if lod == 0:
            gutters(M, roof, lod, H)
            for (x, z) in ((w / 2 - 0.1, dw / 2 + 0.05), (-w / 2 + 0.1, -dw / 2 - 0.05)):
                pass
            ov_f = roof.fov if roof.ridge_x or rk == 'shed' else roof.ov
            downpipe(M, (w / 2 - 0.15, H + 0.1 - ov_f * pitch, dw / 2 + ov_f - 0.05), 0.05, lod, (w / 2 + 0.05, 0, dw / 2 + 0.05))
            downpipe(M, (-w / 2 + 0.15, H + 0.1 - ov_f * pitch, -dw / 2 - ov_f + 0.05), 0.05, lod, (-w / 2 - 0.05, 0, -dw / 2 - 0.05))
    # ---- skirt roof (下屋): a lean-to tiled roof along the front at the first-floor ceiling
    if s.get('skirt') and fl >= 2 and lod <= 2:
        ys = base + fh + 0.05
        dep = 0.9; p = 0.35; k = math.sqrt(1 + p * p)
        x0, x1 = -w / 2 - 0.05, w / 2 + 0.05 if s['skirt'] == 'full' else -w / 2 + w * 0.6
        rp = RoofPlane((x0, ys - dep * p, dw / 2 + dep), (1, 0, 0), (0, p / k, -1 / k), dep * k, 0, x1 - x0, 0, 0)
        from town_lib import roof_plane, ink_plane
        roof_plane(M, rp, lod, 'kawara')
        if ink: ink_plane(M, rp, ink)
        M.box((x0 + x1) / 2, ys + 0.05, dw / 2 + 0.03, x1 - x0, 0.14, 0.08, F(0.6), ROOF)   # flashing on the wall
        # if the skirt covers windows of the first floor top, fine: it sits above them (y = base + fh)
    # ---- balcony on the 2nd floor front
    if s.get('balcony') and fl >= 2:
        Rb = rng(seed, 'balcony')
        y = base + fh + 0.05
        bw = min(w - 0.6, s.get('balcony_w', w * 0.6))
        x1 = w / 2 - 0.3; x0 = x1 - bw
        balcony(M, x0, x1, y, dw / 2, 0.95, lod, Rb, style=s.get('rail', 'bars'))
        if lod <= 1 and Rb.random() < 0.7: ac_unit(M, x0 + 0.6, y, dw / 2 + 0.3, 0, lod)
        if ink and lod == 1: M.ink_box((x0 + x1) / 2, y + 0.45, dw / 2 + 0.47, bw, 1.0, 0.95, ink * 0.6)
    if s.get('back_balcony') and fl >= 2:
        Rb = rng(seed, 'bbal')
        y = base + fh + 0.05
        M.push((0, 0, 0), roty=math.pi)
        balcony(M, -w / 2 + 0.3, w / 2 - 0.3, y, dw / 2, 1.0, lod, Rb, style=s.get('rail', 'panel'), laundry_p=0.9)
        M.pop()
    # ---- apartment: open corridor + steel stair on the front
    if s.get('apartment'):
        Ra = rng(seed, 'apt')
        cd = front_extra - 0.1
        for f in range(1, fl):
            y = base + f * fh
            xr = w / 2 + side_extra
            M.box((xr - w / 2) / 2, y - 0.1, dw / 2 + cd / 2, xr + w / 2, 0.2, cd, C_CONC, 0)
            railing(M, -w / 2, xr, y, dw / 2 + cd, lod, s.get('rail', 'panel'), Ra, h=1.1)
            if ink and lod == 1: M.ink_box((xr - w / 2) / 2, y + 0.45, dw / 2 + cd / 2, xr + w / 2, 1.1, cd, ink * 0.6)
        xr = w / 2 + side_extra
        if lod <= 1:   # posts under the corridor
            for x in (-w / 2 + 0.15, 0, xr - 0.15): M.box(x, (base + fh) / 2, dw / 2 + cd - 0.1, 0.15, base + fh, 0.15, C_STEEL, 0)
        if side_extra > 0:   # steel stair in the side zone, rising from the back to the first corridor
            xc = w / 2 + side_extra / 2; run = min(3.8, dw - 0.6); ytop = base + fh
            for xx in (xc - 0.5, xc + 0.5): M.beam((xx, 0.05, dw / 2 - run), (xx, ytop - 0.05, dw / 2), 0.06, 0.25, C_STEEL, 0)
            n = 14 if lod == 0 else (6 if lod == 1 else 0)
            for i in range(n):
                t = (i + 0.5) / n
                M.box(xc, ytop * t, dw / 2 - run + run * t, 1.0, 0.05, run / n + 0.04, C_STEEL, 0)
            if lod == 2: M.beam((xc, 0.1, dw / 2 - run), (xc, ytop, dw / 2), 1.0, 0.12, C_STEEL, 0)
            if lod <= 1:
                M.beam((xc + 0.55, 0.95, dw / 2 - run), (xc + 0.55, ytop + 0.95, dw / 2), 0.05, 0.05, C_STEEL, 0)
                for i in range(0, 5 if lod == 0 else 2):
                    t = i / (4 if lod == 0 else 1)
                    M.box(xc + 0.55, ytop * t + 0.5, dw / 2 - run + run * t, 0.04, 0.95, 0.04, C_STEEL, 0)
        # mailboxes
        if lod == 0: M.box(-w / 2 + 1.0, 1.0, dw / 2 + 0.3, 1.2, 0.8, 0.35, (0.75, 0.76, 0.74), 0)
    # ---- shop front extras: awning, signboard, a bench
    if shop:
        Rs = rng(seed, 'shop')
        cols = [(0.78, 0.22, 0.2), (0.2, 0.42, 0.7), (0.25, 0.55, 0.35), (0.85, 0.6, 0.2)]
        ac, bc = Rs.choice(cols), (0.93, 0.92, 0.88)
        # awning (テント)
        n = 8 if lod == 0 else (4 if lod == 1 else 1)
        for i in range(n):
            x0 = -w / 2 + 0.3 + i * (w - 0.6) / n; x1 = x0 + (w - 0.6) / n
            c = ac if (i % 2 == 0 or lod == 2) else bc
            M.poly([(x0, 2.75, dw / 2 + 1.0), (x1, 2.75, dw / 2 + 1.0), (x1, 3.15, dw / 2), (x0, 3.15, dw / 2)], c, 0, facing=(0, 1, 0.4))
            M.poly([(x0, 2.75, dw / 2 + 1.0), (x0, 2.45, dw / 2 + 1.0), (x1, 2.45, dw / 2 + 1.0), (x1, 2.75, dw / 2 + 1.0)], c, 0, facing=(0, 0, 1))
            M.poly([(x0, 2.75, dw / 2 + 1.0), (x1, 2.75, dw / 2 + 1.0), (x1, 3.15, dw / 2), (x0, 3.15, dw / 2)], (c[0] * 0.6, c[1] * 0.6, c[2] * 0.6), 0, facing=(0, -1, -0.4))
        # signboard above the awning (kanban): a box with a frame and coloured 'letter' blocks
        sw = w * 0.7
        M.box(0, 3.55, dw / 2 + 0.08, sw, 0.6, 0.12, bc if Rs.random() < 0.5 else ac, 0)
        if lod <= 1:
            nl = Rs.randint(2, 4)
            for i in range(nl):
                M.box(-sw * 0.3 + i * sw * 0.6 / max(1, nl - 1), 3.55, dw / 2 + 0.15, 0.36, 0.4, 0.02, C_DARK if Rs.random() < 0.6 else ac, 0)
        if lod == 0:   # crates of goods out front
            for i in range(Rs.randint(1, 3)): M.box(Rs.uniform(-w / 2 + 0.6, w / 2 - 0.6), 0.25, dw / 2 + 0.5, 0.6, 0.5, 0.45, (0.6, 0.45, 0.3), 0)
    # ---- engawa (old houses): veranda board along the front under the tall windows
    if s.get('engawa') and lod <= 1:
        M.box(0.6, base + 0.0, dw / 2 + 0.45, w - 2.4, 0.08, 0.9, F(0.7), WOOD)
        for x in (-w / 2 + 2.0, w / 2 - 0.4): M.box(x, base / 2, dw / 2 + 0.85, 0.1, base, 0.1, F(0.6), WOOD)
        M.box(0.6, 0.12, dw / 2 + 1.1, 1.0, 0.24, 0.4, (0.62, 0.6, 0.56), 0)   # stepping stone
    # ---- entrance step and side details
    if not shop and not s.get('apartment'):
        M.box(-w / 2 + 1.05, 0.1, dw / 2 + 0.45, 1.4, 0.2, 0.9, C_CONC, 0)
        M.box(-w / 2 + 1.05, 0.28, dw / 2 + 0.25, 1.2, 0.16, 0.5, C_CONC, 0)
        if lod == 0:
            M.box(-w / 2 + 1.9, 1.3, dw / 2 + 0.06, 0.32, 0.4, 0.12, (0.72, 0.7, 0.66), 0)   # mailbox
            M.box(-w / 2 + 0.3, 2.3, dw / 2 + 0.06, 0.12, 0.2, 0.1, (0.95, 0.93, 0.8), 0)   # porch lamp
    Rd = rng(seed, 'decor')
    if s.get('ac', True) and lod <= 1 and not s.get('apartment'):
        side = Rd.choice([1, -1])
        ac_unit(M, side * (w / 2 + 0.2), 0.05, Rd.uniform(-dw / 2 + 1, dw / 2 - 1.5), side * math.pi / 2, lod)
        if lod == 0:   # the pipe cover running up into the wall
            M.box(side * (w / 2 + 0.05), 1.2, Rd.uniform(-1, 1), 0.08, 1.4, 0.09, (0.85, 0.84, 0.78), 0)
    if lod == 0 and not s.get('apartment'):
        M.box(Rd.choice([1, -1]) * (w / 2 + 0.06), 1.5, dw / 2 - 1.2, 0.1, 0.45, 0.32, (0.78, 0.78, 0.76), 0)   # meter box
        if Rd.random() < 0.6:   # potted plants by the door
            for i in range(Rd.randint(1, 3)):
                x = -w / 2 + 1.9 + i * 0.4
                M.box(x, 0.15, dw / 2 + 0.3, 0.28, 0.3, 0.28, (0.6, 0.38, 0.26), 0)
                M.box(x, 0.45, dw / 2 + 0.3, 0.34, 0.3, 0.34, (0.32, 0.55, 0.3), 0)
    if s.get('carport'):
        # carport at the left side, inside the footprint passed by the game? no: drawn outside the walls (-x)
        pass
    if roof and rk in ('gable', 'hip') and lod <= 1:
        Ra = rng(seed, 'roofstuff')
        if Ra.random() < s.get('antenna', 0.6):
            a, b = roof.ridge
            t = Ra.uniform(0.2, 0.8)
            p = (a[0] + (b[0] - a[0]) * t, a[1] + 0.2, a[2] + (b[2] - a[2]) * t)
            antenna(M, p[0], p[1], p[2], lod, rot=Ra.uniform(0, 3))
        if Ra.random() < s.get('solar', 0.25) and roof.planes:
            rp = roof.planes[0]
            ul, ur = rp.urange(0)
            if ur - ul > 4.0: solar_heater(M, rp, (ul + ur) / 2, rp.Vlen * 0.25, lod)
    M.pop()
    return M, dict(w=s['w'], d=d, h=round(top, 2), floors=fl)


def warehouse(spec, lod):
    s = spec; M = Mesh(); w, d = s['w'], s['d']; H = s.get('H', 5.0)
    ink = 0.035 if lod == 0 else (0.07 if lod == 1 else 0.0)
    walls = sides(w, d)
    for side, (O, U, N, L) in walls.items():
        fa = Facade(M, O, U, N, L, H, lod)
        fa.bands.append((0.0, 0.5, 0, C_CONC)); fa.bands.append((0.5, H, WALL, F(0.82)))
        fa.cuts |= {H - 0.5, 1.0}
        if side == 'front':
            fa.ops.append(dict(u0=L * 0.25, u1=L * 0.25 + min(4.0, L * 0.45), y0=0.0, y1=3.6, kind='shutter', open=0.0, depth=0.1))
        for i in range(int(L / 4)):
            u = 2 + i * 4
            if side == 'front' and L * 0.2 < u < L * 0.25 + 4.5: continue
            if u + 1.2 < L: fa.ops.append(dict(u0=u, u1=u + 1.2, y0=H - 1.4, y1=H - 0.6, kind='std', win=(i % 31) + 1, sash=F(0.8)))
        fa.build()
        if lod <= 1:   # corrugated sheet ribs
            n = int(L / (0.25 if lod == 0 else 0.8))
            for i in range(1, n):
                u = i * L / n
                if any(o['u0'] - 0.05 < u < o['u1'] + 0.05 for o in fa.ops if o['y0'] < 1.0): continue
                fa.box(u, (H + 0.5) / 2, 0.015, 0.05, H - 0.5, 0.03, F(0.74), WALL)
    if ink: M.ink_box(0, H / 2, 0, w, H, d, ink)
    roof = Roof('gable', w, d, H, pitch=0.2, ov=0.4, og=0.3, ridge_x=s.get('ridge_x', w >= d))
    roof.build(M, lod, tile='metal', ink=ink)
    roof.gable_walls(M, F(0.82), WALL)
    if lod <= 1:
        for x in (-w / 2 + 0.3, w / 2 - 0.3): M.box(x, 0.4, d / 2 + 0.35, 0.3, 0.8, 0.3, (0.85, 0.75, 0.2), 0)   # bollards
    return M, dict(w=w, d=d, h=round(roof.top, 2), floors=1)


# ---------------------------------------------------------------------------------------------------------------
# the variant catalogue: k = kind used by the game for fitting; st = style ('old' near the shrine lane)
VARIANTS = [
    dict(n='gable2_siding', k='house', st='any', w=8.0, d=7.0, floors=2, roof='gable', wall='siding', balcony=True, seed=11, antenna=0.5),
    dict(n='gable2_mortar', k='house', st='any', w=9.0, d=7.5, floors=2, roof='gable', wall='mortar', balcony=True, rail='panel', seed=12),
    dict(n='hip2_skirt', k='house', st='any', w=9.0, d=8.0, floors=2, roof='hip', wall='mortar', skirt='full', amado=True, seed=13, solar=0.6),
    dict(n='hip2_compact', k='house', st='any', w=7.0, d=7.0, floors=2, roof='hip', wall='two', balcony=True, seed=14),
    dict(n='hip1_old', k='house', st='old', w=10.0, d=8.0, floors=1, roof='hip', wall='wood', engawa=True, amado=True, ov=0.9, seed=15, solar=0.5),
    dict(n='gable1_small', k='house', st='any', w=8.0, d=6.5, floors=1, roof='gable', wall='mortar', amado=True, seed=16),
    dict(n='shed2_modern', k='house', st='new', w=7.0, d=8.0, floors=2, roof='shed', wall='siding', balcony=True, seed=17, ov=0.4),
    dict(n='hip2_large', k='house', st='any', w=10.5, d=8.5, floors=2, roof='hip', wall='two', balcony=True, back_balcony=False, skirt='part', balcony_w=3.6, seed=18, solar=0.7),
    dict(n='gable2_narrow', k='house', st='old', w=5.5, d=9.0, floors=2, roof='gable', wall='wood', ridge_x=False, amado=True, seed=19),
    dict(n='gable2_wide', k='house', st='any', w=10.0, d=7.0, floors=2, roof='gable', wall='two', balcony=True, back_balcony=True, seed=20),
    dict(n='hip2_amado', k='house', st='old', w=8.5, d=8.0, floors=2, roof='hip', wall='mortar', amado=True, skirt='part', seed=21),
    dict(n='gable2_deep', k='house', st='any', w=7.5, d=9.5, floors=2, roof='gable', wall='siding', ridge_x=True, balcony=True, seed=22),
    dict(n='hip1_small', k='house', st='any', w=7.5, d=7.0, floors=1, roof='hip', wall='mortar', amado=True, seed=23),
    dict(n='shop_shutter', k='shop', st='any', w=7.0, d=9.0, floors=2, roof='gable', ridge_x=False, wall='mortar', shop='shutter', seed=31),
    dict(n='shop_glass', k='shop', st='any', w=8.0, d=9.0, floors=2, roof='flat', wall='two', shop='glass', seed=32),
    dict(n='shop_old', k='shop', st='old', w=6.5, d=10.0, floors=2, roof='gable', ridge_x=True, wall='wood', shop='shutter', amado=True, seed=33),
    dict(n='apt2_small', k='apt', st='any', w=13.0, d=8.5, floors=2, roof='hip', pitch=0.3, wall='siding', apartment=True, units=4, front_extra=1.3, side_extra=1.3, back_balcony=True, seed=41, front_ov=1.5),
    dict(n='apt2_long', k='apt', st='any', w=18.0, d=8.5, floors=2, roof='gable', pitch=0.3, wall='two', apartment=True, units=6, front_extra=1.3, side_extra=1.3, back_balcony=True, seed=42, front_ov=1.5),
    dict(n='mansion3', k='apt', st='new', w=20.0, d=10.0, floors=3, roof='flat', wall='mortar', apartment=True, units=5, front_extra=1.3, back_balcony=True, seed=43, stair_hut=True),
    dict(n='warehouse', k='shed', st='any', w=12.0, d=16.0, H=5.5, seed=51),
    dict(n='garage_shed', k='shed', st='any', w=6.0, d=7.0, H=3.2, seed=52),
]


def build_variant(v, lod):
    if v['k'] == 'shed': return warehouse(v, lod)
    return house(v, lod)
