import importlib.util
import math
import pathlib
import random
import unittest

path = pathlib.Path(__file__).resolve().parents[1] / 'tools/blender/blender_humanoid_constraints.py'
spec = importlib.util.spec_from_file_location('humanoid', path)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class HumanoidTests(unittest.TestCase):
    def test_mixamo_and_namespace_variants(self):
        names = ['mixamorig:LeftArm', 'mixamorig1:RightArm', 'Rig:LeftForeArm',
                 'mixamorigRightForeArm', 'LeftFoot', 'mixamo1RightFoot']
        found, skipped = m.resolve_bones(names)
        self.assertEqual(len(found), 6)
        self.assertEqual(found['LeftArm'], names[0])
        self.assertEqual(skipped['LeftHand'], 'missing')

    def test_ambiguous_names_are_not_guessed(self):
        found, skipped = m.resolve_bones(['A:LeftArm', 'B:LeftArm', 'LeftArmTwist'])
        self.assertNotIn('LeftArm', found)
        self.assertTrue(skipped['LeftArm'].startswith('ambiguous'))
        self.assertEqual(m.resolve_bones([])[0], {})

    def test_true_cone_bound_and_unit_length(self):
        rng = random.Random(24)
        for degrees in [0, 15, 60, 110, 179, 180]:
            angle = math.radians(degrees)
            for _ in range(200):
                direction = tuple(rng.uniform(-1, 1) for _ in range(3))
                result = m.cone_direction(direction, angle)
                self.assertAlmostEqual(sum(v*v for v in result), 1)
                self.assertGreaterEqual(result[1] + 1e-12, math.cos(angle))
                again = m.cone_direction(result, angle)
                for a, b in zip(result, again): self.assertAlmostEqual(a, b)
        self.assertEqual(m.cone_direction((0, -1, 0), 0), (0, 1, 0))

    def test_periodic_nonaccumulating_arc(self):
        for t in [0, .1, 3, 100]:
            a = m.sine_arc(t, frequency=.8)
            b = m.sine_arc(t + 1/.8, frequency=.8)
            for x, y in zip(a, b): self.assertAlmostEqual(x, y)
            self.assertEqual(a, m.sine_arc(t, frequency=.8))
            self.assertLessEqual(abs(a[0]), .12)
            self.assertLessEqual(abs(a[2]), .036)
        self.assertEqual(m.sine_arc(1, amplitude=0), (0, 0, 0))

    def test_invalid_parameters(self):
        for direction, angle in [((0, 0, 0), 1), ((math.nan, 1, 0), 1), ((0, 1, 0), -1)]:
            with self.assertRaises(ValueError): m.cone_direction(direction, angle)
        for kw in [{'amplitude':-1}, {'frequency':-1}, {'time':math.inf}, {'arc_ratio':2}]:
            args = {'time':0, **kw}
            with self.assertRaises(ValueError): m.sine_arc(**args)


class RecoveryTests(unittest.TestCase):
    def test_restore_action_modes_and_static_pose(self):
        import json
        import sys
        from types import SimpleNamespace as NS
        from unittest.mock import patch
        class Action(dict): pass
        for source_name in ['', 'Walk']:
            with self.subTest(source=source_name):
                source = Action() if source_name else None
                matrix = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
                generated = Action(humanoid_review_owner='Rig', humanoid_review_source=source_name,
                    humanoid_review_modes=json.dumps({'LeftArm':'XYZ','Removed':'XYZ'}),
                    humanoid_review_pose=json.dumps({'LeftArm':matrix, 'Removed':matrix}))
                bone = NS(rotation_mode='QUATERNION', matrix_basis=None)
                obj = NS(type='ARMATURE', mode='OBJECT', name='Rig',
                    animation_data=NS(action=generated), pose=NS(bones={'LeftArm':bone}))
                frames=[]
                scene=NS(frame_current=17,frame_subframe=.5,frame_set=lambda *a,**k:frames.append((a,k)))
                bpy=NS(context=NS(object=obj,scene=scene),data=NS(actions={'Walk':source}))
                with patch.dict(sys.modules, {'bpy':bpy,'mathutils':NS(Matrix=lambda v:v)}):
                    self.assertIs(m.restore_source_action(),source)
                self.assertIs(obj.animation_data.action,source)
                self.assertEqual(bone.rotation_mode,'XYZ')
                self.assertEqual(bone.matrix_basis,matrix)
                self.assertTrue(generated.use_fake_user)
                self.assertEqual(frames,[((17,),{'subframe':.5})])

    def test_missing_source_does_not_detach_generated_action(self):
        import sys
        from types import SimpleNamespace as NS
        from unittest.mock import patch
        action={'humanoid_review_owner':'Rig','humanoid_review_source':'Deleted'}
        obj=NS(type='ARMATURE',mode='OBJECT',name='Rig',animation_data=NS(action=action))
        bpy=NS(context=NS(object=obj),data=NS(actions={}))
        with patch.dict(sys.modules,{'bpy':bpy,'mathutils':NS(Matrix=lambda v:v)}):
            with self.assertRaisesRegex(ValueError,'Source action is missing'):
                m.restore_source_action()
        self.assertIs(obj.animation_data.action,action)

if __name__ == '__main__': unittest.main()
