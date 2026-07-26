import { memo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Box, Typography, TextField, Chip, Stack } from '@mui/material';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import { COLORS } from '../../theme';
import { FlowMethodData } from '../../types';

const RouterNode = ({ data, id }: NodeProps<FlowMethodData>) => {
  const { setNodes } = useReactFlow();
  const [methodName, setMethodName] = useState(data.method_name || '');
  const [eventsText, setEventsText] = useState((data.router_events || []).join(', '));

  useEffect(() => {
    setMethodName(data.method_name || '');
  }, [data.method_name]);

  useEffect(() => {
    setEventsText((data.router_events || []).join(', '));
  }, [data.router_events]);

  const handleMethodNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setMethodName(newName);
    setNodes(nds =>
      nds.map(n =>
        n.id === id
          ? { ...n, data: { ...n.data, method_name: newName } }
          : n
      )
    );
  }, [id, setNodes]);

  const handleEventsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setEventsText(newText);
    const events = newText.split(',').map(s => s.trim()).filter(Boolean);
    setNodes(nds =>
      nds.map(n =>
        n.id === id
          ? { ...n, data: { ...n.data, router_events: events } }
          : n
      )
    );
  }, [id, setNodes]);

  const events = data.router_events || [];

  return (
    <Box
      aria-label="Router node - event router"
      sx={{
        minWidth: 200,
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${COLORS.router.border}50`,
        bgcolor: COLORS.router.bg,
        boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
        transition: 'all 0.15s ease',
        '&:hover': {
          border: `1px solid ${COLORS.router.border}90`,
          boxShadow: `0 0 16px ${COLORS.router.primary}15`,
        },
        position: 'relative',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.6,
          bgcolor: COLORS.router.headerBg,
          borderBottom: `1px solid ${COLORS.router.border}30`,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <AltRouteIcon sx={{ fontSize: 14, color: COLORS.router.primary }} />
        <Typography
          variant="caption"
          sx={{
            color: COLORS.router.primary,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: '0.6rem',
          }}
        >
          @router
        </Typography>
      </Box>

      {/* Body */}
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {/* Method Name */}
        <Box>
          <Typography
            variant="caption"
            sx={{ color: COLORS.text.muted, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.25, display: 'block' }}
          >
            Method Name
          </Typography>
          <TextField
            value={methodName}
            onChange={handleMethodNameChange}
            placeholder="method_name"
            size="small"
            fullWidth
            variant="outlined"
            onClick={(e) => e.stopPropagation()}
            inputProps={{
              'aria-label': 'Router node method name',
              style: { fontSize: '0.75rem', padding: '4px 8px' },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: `${COLORS.surface.elevated}40`,
                borderRadius: '6px',
                '& fieldset': { borderColor: `${COLORS.surface.border}50` },
                '&:hover fieldset': { borderColor: COLORS.router.border },
                '&.Mui-focused fieldset': { borderColor: COLORS.router.primary },
              },
            }}
          />
        </Box>

        {/* Outgoing Events */}
        <Box>
          <Typography
            variant="caption"
            sx={{ color: COLORS.text.muted, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.25, display: 'block' }}
          >
            Outgoing Events
          </Typography>
          <TextField
            value={eventsText}
            onChange={handleEventsChange}
            placeholder="event1, event2, ..."
            size="small"
            fullWidth
            variant="outlined"
            onClick={(e) => e.stopPropagation()}
            inputProps={{
              'aria-label': 'Router node outgoing events (comma-separated)',
              style: { fontSize: '0.75rem', padding: '4px 8px' },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: `${COLORS.surface.elevated}40`,
                borderRadius: '6px',
                '& fieldset': { borderColor: `${COLORS.surface.border}50` },
                '&:hover fieldset': { borderColor: COLORS.router.border },
                '&.Mui-focused fieldset': { borderColor: COLORS.router.primary },
              },
            }}
          />
          {events.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {events.map((evt, i) => (
                <Chip
                  key={i}
                  label={evt}
                  size="small"
                  sx={{
                    fontSize: '0.6rem',
                    height: 18,
                    bgcolor: `${COLORS.router.primary}20`,
                    color: COLORS.router.primary,
                    border: `1px solid ${COLORS.router.border}40`,
                  }}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="router-in"
        style={{
          background: COLORS.router.primary,
          borderRadius: '50%',
          width: 12,
          height: 12,
          border: `2px solid ${COLORS.surface.elevated}`,
          left: -6,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="router-out"
        style={{
          background: COLORS.text.secondary,
          borderRadius: '50%',
          width: 12,
          height: 12,
          border: `2px solid ${COLORS.surface.elevated}`,
          right: -6,
        }}
      />
    </Box>
  );
};

export default memo(RouterNode);
